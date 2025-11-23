-- ============================================
-- FORCE SCHEMA RELOAD (No Superuser Required)
-- This forces PostgREST/GoTrue to reload schema
-- ============================================

-- Method 1: Notify PostgREST to reload schema
-- This is the main way to refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- Method 2: Also try reloading config
NOTIFY pgrst, 'reload config';

-- Method 3: Create a dummy function to force schema introspection
-- This makes PostgREST re-read the schema
DO $do$
BEGIN
  -- Create a temporary function that does nothing
  -- This forces schema introspection
  -- Use different dollar-quote tag to avoid nesting issues
  EXECUTE 'CREATE OR REPLACE FUNCTION _force_schema_reload() RETURNS void LANGUAGE sql AS $func$ SELECT NULL; $func$';
  
  -- Drop it immediately
  DROP FUNCTION _force_schema_reload();
  
  RAISE NOTICE '✓ Forced schema reload by creating/dropping function';
END $do$;

-- Method 4: Verify auth.users is accessible
SELECT 
  'Schema Verification' as check_type,
  COUNT(*) as user_count,
  '✓ auth.users is accessible' as status
FROM auth.users;

-- Method 5: Check if we can see all columns (this is what GoTrue does)
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
ORDER BY ordinal_position;

