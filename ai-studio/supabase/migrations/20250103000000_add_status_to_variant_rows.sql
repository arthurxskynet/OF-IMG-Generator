-- Migration: Add status column to variant_rows table
-- This enables tracking generation status for variant rows, similar to model_rows

-- Add status column with default 'idle'
ALTER TABLE public.variant_rows
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'idle'
CHECK (status IN ('idle', 'queued', 'running', 'partial', 'done', 'error'));

-- Create index for status queries (useful for filtering and cleanup)
CREATE INDEX IF NOT EXISTS idx_variant_rows_status ON public.variant_rows(status);

-- Create index for status + updated_at (useful for cleanup queries)
CREATE INDEX IF NOT EXISTS idx_variant_rows_status_updated_at ON public.variant_rows(status, updated_at);

-- Update existing rows to have appropriate status based on their jobs
-- If they have active jobs, set to 'running' or 'partial'
-- If they have succeeded jobs, set to 'done'
-- Otherwise, keep as 'idle'
UPDATE public.variant_rows vr
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.variant_row_id = vr.id
    AND j.status IN ('queued', 'submitted', 'running', 'saving')
  ) THEN 'running'
  WHEN EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.variant_row_id = vr.id
    AND j.status = 'succeeded'
  ) THEN 'done'
  WHEN EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.variant_row_id = vr.id
    AND j.status = 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM public.jobs j2
      WHERE j2.variant_row_id = vr.id
      AND j2.status = 'succeeded'
    )
  ) THEN 'error'
  ELSE 'idle'
END
WHERE status = 'idle';

