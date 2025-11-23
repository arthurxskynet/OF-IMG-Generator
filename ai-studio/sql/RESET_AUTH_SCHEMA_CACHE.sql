-- ============================================
-- RESET AUTH SCHEMA CACHE
-- This forces GoTrue to reload the schema
-- ============================================

-- Refresh PostgREST schema cache (forces API to reload)
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Also try to refresh the database connection pool
-- (This might help if there's a stale connection with bad schema info)
SELECT pg_reload_conf();

-- Check current database connections
SELECT 
  'Database Connections' as check_type,
  COUNT(*) as total_connections,
  COUNT(*) FILTER (WHERE state = 'active') as active_connections,
  COUNT(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity
WHERE datname = current_database();

-- Verify auth schema is accessible
SELECT 
  'Schema Access' as check_type,
  has_schema_privilege('auth', 'USAGE') as can_access_auth_schema,
  has_table_privilege('auth.users', 'SELECT') as can_select_users,
  has_table_privilege('auth.users', 'INSERT') as can_insert_users;

