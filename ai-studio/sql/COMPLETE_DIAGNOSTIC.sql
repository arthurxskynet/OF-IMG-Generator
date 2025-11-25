-- ============================================
-- COMPLETE DIAGNOSTIC - Find what's breaking auth
-- Run this to find ALL issues
-- ============================================

-- 1. Test if gen_random_uuid exists (this might be the issue)
DO $$
BEGIN
  PERFORM gen_random_uuid();
  RAISE NOTICE '✓ gen_random_uuid() exists';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE '❌ gen_random_uuid() DOES NOT EXIST - THIS IS LIKELY THE PROBLEM';
  RAISE NOTICE 'The setup-database.sql uses gen_random_uuid() but it does not exist';
END $$;

-- 2. Check for broken functions that reference non-existent functions
SELECT 
  'Broken Function References' as check_type,
  proname as function_name,
  CASE 
    WHEN prosrc LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN '❌ REFERENCES NON-EXISTENT gen_random_uuid'
    WHEN prosrc LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    ELSE '✓ OK'
  END as issue
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND (prosrc LIKE '%gen_random_uuid%' OR prosrc LIKE '%claim_jobs_with_capacity%');

-- 3. Check for triggers on auth.users (these run during auth operations)
SELECT 
  'Auth Triggers' as check_type,
  tgname as trigger_name,
  tgrelid::regclass::text as table_name,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid::regclass::text = 'auth.users'
  AND NOT tgisinternal;

-- 4. Check for any views that query auth.users
SELECT 
  'Views on Auth' as check_type,
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE definition LIKE '%auth.users%'
  OR definition LIKE '%auth.identities%';

-- 5. Check for RLS policies that might be broken
SELECT 
  'RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'auth'
  AND tablename = 'users';

-- 6. Try to directly query auth.users (this is what GoTrue does)
DO $$
DECLARE
  test_user_count int;
BEGIN
  SELECT COUNT(*) INTO test_user_count FROM auth.users LIMIT 1;
  RAISE NOTICE '✓ Can query auth.users - returned % rows', test_user_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Cannot query auth.users: %', SQLERRM;
  RAISE NOTICE 'This is the root cause of the login error!';
END $$;

-- 7. Check for any functions in auth schema that might be broken
SELECT 
  'Auth Schema Functions' as check_type,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
ORDER BY proname;


