-- ============================================
-- VERIFY FIXES AND CHECK FOR OTHER ISSUES
-- Run this to see if everything is fixed
-- ============================================

-- 1. Verify NULL tokens are fixed (only check columns that exist)
SELECT 
  'Token Status' as check_type,
  COUNT(*) FILTER (WHERE confirmation_token IS NULL) as null_confirmation_token,
  COUNT(*) FILTER (WHERE email_change IS NULL) as null_email_change,
  COUNT(*) as total_users
FROM auth.users;

-- 2. Check if broken function exists
SELECT 
  'Function Check' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'claim_jobs_with_capacity' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN '❌ BROKEN FUNCTION EXISTS'
    ELSE '✓ NO BROKEN FUNCTION'
  END as status;

-- 3. Refresh PostgREST schema cache (this might help)
NOTIFY pgrst, 'reload schema';

-- 4. Check for any other potential issues
SELECT 
  'Schema Health' as check_type,
  (SELECT COUNT(*) FROM auth.users WHERE confirmation_token IS NULL OR email_change IS NULL) as users_with_null_tokens,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'claim_jobs_with_capacity' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) as broken_functions_exist,
  CASE 
    WHEN (SELECT COUNT(*) FROM auth.users WHERE confirmation_token IS NULL OR email_change IS NULL) > 0
    THEN '❌ NULL tokens still exist - run FIX_ALL_NULL_COLUMNS.sql again'
    WHEN (SELECT COUNT(*) FROM pg_proc WHERE proname = 'claim_jobs_with_capacity' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) > 0
    THEN '❌ Broken function exists - run SAFE_FIX_ALL.sql'
    ELSE '✓ Schema appears healthy'
  END as overall_status;

