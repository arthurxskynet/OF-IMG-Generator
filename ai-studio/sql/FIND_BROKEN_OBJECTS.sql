-- ============================================
-- FIND ALL BROKEN DATABASE OBJECTS
-- This will identify what's causing the schema error
-- ============================================

-- 1. Check for functions using gen_random_uuid (might be broken)
SELECT 
  'Functions using gen_random_uuid' as check_type,
  proname as function_name,
  prosrc as function_source,
  CASE 
    WHEN prosrc LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN '❌ USES gen_random_uuid BUT pgcrypto NOT ENABLED'
    WHEN prosrc LIKE '%gen_random_uuid%' THEN '⚠️ USES gen_random_uuid - CHECK IF FUNCTION EXISTS'
    ELSE '✓ OK'
  END as status
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND prosrc LIKE '%gen_random_uuid%';

-- 2. Test if gen_random_uuid exists
DO $$
BEGIN
  PERFORM gen_random_uuid();
  RAISE NOTICE '✓ gen_random_uuid() function exists';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE '❌ gen_random_uuid() does NOT exist - this is the problem!';
  RAISE NOTICE 'Fix: Use uuid_generate_v4() from uuid-ossp extension instead';
END $$;

-- 3. Check all public functions for potential issues
SELECT 
  'All Public Functions' as check_type,
  proname as function_name,
  CASE 
    WHEN proname = 'claim_jobs_with_capacity' THEN '❌ BROKEN FUNCTION'
    WHEN prosrc LIKE '%gen_random_uuid%' AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN '❌ USES NON-EXISTENT FUNCTION'
    ELSE '✓ OK'
  END as status
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- 4. Check if pgcrypto extension is enabled
SELECT 
  'Extensions' as check_type,
  extname,
  extversion,
  CASE 
    WHEN extname = 'pgcrypto' AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN '❌ ENABLED BUT FUNCTION MISSING'
    WHEN extname = 'pgcrypto' THEN '✓ OK'
    WHEN extname = 'uuid-ossp' THEN '✓ OK'
    ELSE 'OTHER'
  END as status
FROM pg_extension
WHERE extname IN ('pgcrypto', 'uuid-ossp')
ORDER BY extname;


