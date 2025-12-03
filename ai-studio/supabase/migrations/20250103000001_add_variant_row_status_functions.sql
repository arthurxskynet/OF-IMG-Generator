-- Migration: Add database functions for variant row status management
-- These functions mirror the functionality for model_rows

-- Function to mark variant rows as running when jobs are claimed
CREATE OR REPLACE FUNCTION public.mark_variant_rows_running(p_variant_row_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.variant_rows
     SET status = 'running',
         updated_at = NOW()
   WHERE id = ANY(p_variant_row_ids)
     AND status IN ('idle', 'queued');
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_variant_rows_running(uuid[]) TO authenticated;

-- Function to update variant row status based on job statuses
-- This is called when a job completes (succeeds or fails)
CREATE OR REPLACE FUNCTION public.update_variant_row_status(p_variant_row_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining_count int;
  v_succeeded_count int;
  v_failed_count int;
  v_new_status text;
BEGIN
  -- Count remaining active jobs
  SELECT COUNT(*) INTO v_remaining_count
  FROM public.jobs
  WHERE variant_row_id = p_variant_row_id
    AND status IN ('queued', 'submitted', 'running', 'saving');

  -- Count succeeded jobs
  SELECT COUNT(*) INTO v_succeeded_count
  FROM public.jobs
  WHERE variant_row_id = p_variant_row_id
    AND status = 'succeeded';

  -- Count failed jobs
  SELECT COUNT(*) INTO v_failed_count
  FROM public.jobs
  WHERE variant_row_id = p_variant_row_id
    AND status = 'failed';

  -- Determine new status
  IF v_remaining_count > 0 THEN
    v_new_status := 'partial';
  ELSIF v_succeeded_count > 0 THEN
    v_new_status := 'done';
  ELSIF v_failed_count > 0 AND v_succeeded_count = 0 THEN
    v_new_status := 'error';
  ELSE
    v_new_status := 'idle';
  END IF;

  -- Update variant row status
  UPDATE public.variant_rows
     SET status = v_new_status,
         updated_at = NOW()
   WHERE id = p_variant_row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_variant_row_status(uuid) TO authenticated;

-- Function to cleanup stuck jobs efficiently
-- This function can be called periodically to clean up jobs that are stuck
CREATE OR REPLACE FUNCTION public.cleanup_stuck_jobs()
RETURNS TABLE(
  cleaned_count int,
  stuck_queued int,
  stuck_submitted int,
  stuck_running int,
  stuck_saving int,
  stale_jobs int
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_two_min_ago timestamptz;
  v_five_min_ago timestamptz;
  v_ten_min_ago timestamptz;
  v_ninety_sec_ago timestamptz;
  v_one_hour_ago timestamptz;
  v_stuck_queued int := 0;
  v_stuck_submitted int := 0;
  v_stuck_running int := 0;
  v_stuck_saving int := 0;
  v_stale_jobs int := 0;
BEGIN
  -- Calculate time thresholds
  v_two_min_ago := NOW() - INTERVAL '2 minutes';
  v_five_min_ago := NOW() - INTERVAL '5 minutes';
  v_ten_min_ago := NOW() - INTERVAL '10 minutes';
  v_ninety_sec_ago := NOW() - INTERVAL '90 seconds';
  v_one_hour_ago := NOW() - INTERVAL '1 hour';

  -- Clean up queued jobs older than 2 minutes
  WITH updated AS (
    UPDATE public.jobs
    SET status = 'failed',
        error = 'timeout: stuck in queue',
        updated_at = NOW()
    WHERE status = 'queued'
      AND created_at < v_two_min_ago
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stuck_queued FROM updated;

  -- Clean up submitted jobs without provider_request_id older than 90 seconds
  WITH updated AS (
    UPDATE public.jobs
    SET status = 'failed',
        error = 'timeout: no provider request id',
        updated_at = NOW()
    WHERE status = 'submitted'
      AND provider_request_id IS NULL
      AND created_at < v_ninety_sec_ago
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stuck_submitted FROM updated;

  -- Clean up running jobs without provider_request_id older than 5 minutes
  WITH updated AS (
    UPDATE public.jobs
    SET status = 'failed',
        error = 'timeout: no provider request id',
        updated_at = NOW()
    WHERE status = 'running'
      AND provider_request_id IS NULL
      AND updated_at < v_five_min_ago
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stuck_running FROM updated;

  -- Clean up saving jobs older than 10 minutes
  WITH updated AS (
    UPDATE public.jobs
    SET status = 'failed',
        error = 'timeout: stuck in saving',
        updated_at = NOW()
    WHERE status = 'saving'
      AND updated_at < v_ten_min_ago
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stuck_saving FROM updated;

  -- Clean up any stale jobs (any status) older than 1 hour
  WITH updated AS (
    UPDATE public.jobs
    SET status = 'failed',
        error = 'timeout: stale job',
        updated_at = NOW()
    WHERE status IN ('queued', 'submitted', 'running', 'saving')
      AND updated_at < v_one_hour_ago
    RETURNING id
  )
  SELECT COUNT(*) INTO v_stale_jobs FROM updated;

  -- Update variant row statuses for affected rows
  PERFORM public.update_variant_row_status(vr.id)
  FROM public.variant_rows vr
  WHERE EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.variant_row_id = vr.id
    AND j.status = 'failed'
    AND j.error LIKE 'timeout:%'
    AND j.updated_at > NOW() - INTERVAL '1 minute'
  );

  -- Update model row statuses for affected rows (mirror existing logic)
  -- Note: model_rows table does not have updated_at column, so we only update status
  -- Use explicit column list to prevent any trigger or automatic behavior from trying to set updated_at
  UPDATE public.model_rows mr
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.row_id = mr.id
      AND j.status IN ('queued', 'submitted', 'running', 'saving')
    ) THEN 'partial'
    WHEN EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.row_id = mr.id
      AND j.status = 'succeeded'
    ) THEN 'done'
    ELSE 'error'
    END
  WHERE EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.row_id = mr.id
    AND j.status = 'failed'
    AND j.error LIKE 'timeout:%'
    AND j.updated_at > NOW() - INTERVAL '1 minute'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.row_id = mr.id
    AND j.status IN ('queued', 'submitted', 'running', 'saving')
  );

  -- Return cleanup statistics
  RETURN QUERY SELECT
    (v_stuck_queued + v_stuck_submitted + v_stuck_running + v_stuck_saving + v_stale_jobs)::int as cleaned_count,
    v_stuck_queued::int as stuck_queued,
    v_stuck_submitted::int as stuck_submitted,
    v_stuck_running::int as stuck_running,
    v_stuck_saving::int as stuck_saving,
    v_stale_jobs::int as stale_jobs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stuck_jobs() TO authenticated;

