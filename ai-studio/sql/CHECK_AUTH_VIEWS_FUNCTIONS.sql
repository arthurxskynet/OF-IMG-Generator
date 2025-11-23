-- ============================================
-- CHECK AUTH VIEWS AND FUNCTIONS
-- GoTrue might use these and they could be broken
-- ============================================

-- 1. Check all views in auth schema
SELECT 
  'Auth Views' as check_type,
  schemaname,
  viewname,
  CASE 
    WHEN definition LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN '❌ REFERENCES NON-EXISTENT FUNCTION'
    WHEN definition LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    ELSE '✓ OK'
  END as status,
  definition
FROM pg_views
WHERE schemaname = 'auth';

-- 2. Check all functions in auth schema
SELECT 
  'Auth Functions' as check_type,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  CASE 
    WHEN p.prosrc LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN '❌ REFERENCES NON-EXISTENT FUNCTION'
    WHEN p.prosrc LIKE '%claim_jobs_with_capacity%' THEN '❌ REFERENCES BROKEN FUNCTION'
    ELSE '✓ OK'
  END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth'
ORDER BY p.proname;

-- 3. Check for any materialized views
SELECT 
  'Materialized Views' as check_type,
  schemaname,
  matviewname,
  definition
FROM pg_matviews
WHERE schemaname = 'auth';

-- 4. Try to test if we can query auth.users through a view (if any exists)
SELECT 
  'View Access Test' as check_type,
  viewname,
  'Testing access...' as status
FROM pg_views
WHERE schemaname = 'auth'
LIMIT 1;

