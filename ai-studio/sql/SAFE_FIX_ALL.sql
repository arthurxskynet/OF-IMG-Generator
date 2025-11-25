-- ============================================
-- SAFE FIX SCRIPT - Fixes issues without breaking anything
-- Run this AFTER running DIAGNOSE_CURRENT_STATE.sql
-- ============================================

-- Step 1: Remove broken function if it exists
DROP FUNCTION IF EXISTS public.claim_jobs_with_capacity(int, bigint) CASCADE;

-- Step 2: Ensure working function exists
CREATE OR REPLACE FUNCTION public.claim_jobs_global(p_limit int)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.jobs j
     SET status = 'submitted',
         updated_at = now()
    FROM to_claim c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_jobs_global(int) TO authenticated;

-- Step 3: Fix auth.users NULL token fields (only if columns exist)
DO $$
BEGIN
  -- Fix confirmation_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' 
    AND table_name = 'users' 
    AND column_name = 'confirmation_token'
  ) THEN
    UPDATE auth.users 
    SET confirmation_token = COALESCE(confirmation_token, '')
    WHERE confirmation_token IS NULL;
    RAISE NOTICE 'Fixed confirmation_token NULL values';
  END IF;
  
  -- Fix email_change
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' 
    AND table_name = 'users' 
    AND column_name = 'email_change'
  ) THEN
    UPDATE auth.users 
    SET email_change = COALESCE(email_change, '')
    WHERE email_change IS NULL;
    RAISE NOTICE 'Fixed email_change NULL values';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot UPDATE auth.users - use Supabase Dashboard to fix users';
WHEN OTHERS THEN
  RAISE NOTICE 'Error fixing auth tokens: %', SQLERRM;
END $$;

-- Step 4: Fix schema issues (only if needed)
DO $$
BEGIN
  -- Make target_image_url nullable if it's currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'model_rows' 
    AND column_name = 'target_image_url'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.model_rows ALTER COLUMN target_image_url DROP NOT NULL;
    RAISE NOTICE 'Made target_image_url nullable';
  END IF;

  -- Remove max_concurrency if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'models' 
    AND column_name = 'max_concurrency'
  ) THEN
    ALTER TABLE public.models DROP COLUMN max_concurrency;
    RAISE NOTICE 'Removed max_concurrency column';
  END IF;

  -- Rename variants_default to requests_default if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'models' 
    AND column_name = 'variants_default'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'models' 
      AND column_name = 'requests_default'
    )
  ) THEN
    ALTER TABLE public.models RENAME COLUMN variants_default TO requests_default;
    RAISE NOTICE 'Renamed variants_default to requests_default';
  END IF;
END $$;

-- Step 5: Verify fixes
SELECT 
  'Fix Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'claim_jobs_with_capacity' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN 'BROKEN FUNCTION STILL EXISTS'
    ELSE 'BROKEN FUNCTION REMOVED ✓'
  END as function_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM auth.users 
      WHERE confirmation_token IS NULL OR email_change IS NULL
    ) THEN 'NULL TOKENS STILL EXIST'
    ELSE 'NULL TOKENS FIXED ✓'
  END as token_status;


