-- ============================================
-- FINAL VERIFICATION - Check if everything is fixed
-- Run this to verify the database is working
-- ============================================

-- 1. Check if broken function is removed
SELECT 
  'Function Status' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'claim_jobs_with_capacity' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN '❌ BROKEN FUNCTION STILL EXISTS'
    ELSE '✓ BROKEN FUNCTION REMOVED'
  END as status;

-- 2. Check if working function exists
SELECT 
  'Working Function' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'claim_jobs_global' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN '✓ WORKING FUNCTION EXISTS'
    ELSE '❌ WORKING FUNCTION MISSING'
  END as status;

-- 3. Check NULL values (only for columns that exist)
SELECT 
  'Token NULL Check' as check_type,
  COUNT(*) FILTER (WHERE confirmation_token IS NULL) as null_confirmation_token,
  COUNT(*) FILTER (WHERE email_change IS NULL) as null_email_change,
  COUNT(*) as total_users
FROM auth.users;

-- 4. Test if the working function can be called
DO $$
DECLARE
  test_result public.jobs[];
BEGIN
  -- Try to call the function (should return empty if no queued jobs)
  SELECT ARRAY(SELECT * FROM public.claim_jobs_global(1) LIMIT 1) INTO test_result;
  RAISE NOTICE '✓ Function call successful';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Function call failed: %', SQLERRM;
END $$;

-- 5. Summary
SELECT 
  'Summary' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_jobs_with_capacity' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    THEN '❌ Database has issues - broken function exists'
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE confirmation_token IS NULL OR email_change IS NULL)
    THEN '❌ Database has issues - NULL tokens exist'
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_jobs_global' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    THEN '❌ Database has issues - working function missing'
    ELSE '✓ Database appears to be fixed'
  END as overall_status;

