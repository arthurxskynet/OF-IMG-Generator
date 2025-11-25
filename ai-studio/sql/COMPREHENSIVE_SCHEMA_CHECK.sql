-- ============================================
-- COMPREHENSIVE SCHEMA CHECK
-- Find ALL potentially broken database objects
-- ============================================

-- 1. Check for broken functions (syntax errors)
SELECT 
  'Broken Functions' as check_type,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  CASE 
    WHEN prosrc LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    WHEN prosrc LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN '❌ USES gen_random_uuid BUT EXTENSION MISSING'
    ELSE '✓ OK'
  END as status
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- 2. Check for broken views
SELECT 
  'Views Check' as check_type,
  schemaname,
  viewname,
  CASE 
    WHEN definition LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    ELSE '✓ OK'
  END as status
FROM pg_views
WHERE schemaname IN ('public', 'auth')
ORDER BY schemaname, viewname;

-- 3. Check for broken triggers
SELECT 
  'Triggers Check' as check_type,
  tgname as trigger_name,
  tgrelid::regclass::text as table_name,
  CASE 
    WHEN pg_get_triggerdef(oid) LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    ELSE '✓ OK'
  END as status
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text LIKE '%auth%' OR tgrelid::regclass::text LIKE '%public%'
ORDER BY tgname;

-- 4. Check for materialized views
SELECT 
  'Materialized Views' as check_type,
  schemaname,
  matviewname,
  'Check manually' as status
FROM pg_matviews
WHERE schemaname IN ('public', 'auth');

-- 5. Check auth schema functions (GoTrue might call these)
SELECT 
  'Auth Functions' as check_type,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
ORDER BY proname;

-- 6. Check for any RPC functions that might be broken
SELECT 
  'RPC Functions' as check_type,
  routine_name,
  routine_type,
  CASE 
    WHEN routine_name LIKE '%claim%' THEN 'Check this function'
    ELSE 'OK'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 7. Test if we can query auth.users without errors
DO $$
DECLARE
  test_count int;
BEGIN
  SELECT COUNT(*) INTO test_count FROM auth.users LIMIT 1;
  RAISE NOTICE '✓ Can query auth.users successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Cannot query auth.users: %', SQLERRM;
END $$;

-- 8. Check for any constraints that might be broken
SELECT 
  'Constraints Check' as check_type,
  conname as constraint_name,
  conrelid::regclass::text as table_name,
  contype as constraint_type
FROM pg_constraint
WHERE connamespace IN (
  SELECT oid FROM pg_namespace WHERE nspname IN ('public', 'auth')
)
AND conrelid::regclass::text LIKE '%users%'
ORDER BY conname;


