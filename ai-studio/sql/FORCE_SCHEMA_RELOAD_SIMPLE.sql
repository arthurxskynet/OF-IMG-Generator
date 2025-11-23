-- ============================================
-- FORCE SCHEMA RELOAD (Simple Version)
-- ============================================

-- Method 1: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Method 2: Create and drop a function (simpler approach)
CREATE OR REPLACE FUNCTION _force_schema_reload()
RETURNS void
LANGUAGE sql
AS $func$
  SELECT NULL;
$func$;

DROP FUNCTION _force_schema_reload();

-- Method 3: Verify auth.users is accessible
SELECT 
  'Schema Verification' as check_type,
  COUNT(*) as user_count,
  '✓ auth.users is accessible' as status
FROM auth.users;

