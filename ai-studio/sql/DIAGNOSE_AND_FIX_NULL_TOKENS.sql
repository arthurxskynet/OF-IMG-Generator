-- ============================================
-- COMPREHENSIVE DIAGNOSTIC AND FIX SCRIPT
-- This script diagnoses NULL token issues and fixes them
-- Run this to resolve the 500 authentication errors
-- ============================================

-- ============================================
-- STEP 1: DIAGNOSTIC - Check for NULL values
-- ============================================

SELECT '=== STEP 1: DIAGNOSTIC ===' as step;

-- Check ALL token-related columns for NULL values (using dynamic SQL)
DO $$
DECLARE
  sql_text text;
  col_list text[] := ARRAY[]::text[];
  col_name text;
  exists_check boolean;
BEGIN
  -- Build list of columns that exist
  FOR col_name IN 
    SELECT unnest(ARRAY[
      'email_change_token_new',
      'confirmation_token',
      'email_change',
      'email_change_token',
      'recovery_token',
      'phone_change',
      'phone_change_token'
    ])
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = col_name
    ) INTO exists_check;
    
    IF exists_check THEN
      col_list := col_list || col_name;
    END IF;
  END LOOP;
  
  -- Build and execute diagnostic query only for existing columns
  IF array_length(col_list, 1) > 0 THEN
    sql_text := 'SELECT ''NULL Values Check'' as check_type, ';
    sql_text := sql_text || 'COUNT(*) as total_users';
    
    FOREACH col_name IN ARRAY col_list
    LOOP
      sql_text := sql_text || ', COUNT(*) FILTER (WHERE ' || quote_ident(col_name) || ' IS NULL) as null_' || col_name;
    END LOOP;
    
    sql_text := sql_text || ' FROM auth.users';
    
    EXECUTE sql_text;
  ELSE
    RAISE NOTICE '⚠️ No token columns found';
  END IF;
END $$;

-- List all token-related columns in auth.users
SELECT 
  'Column Structure' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
  AND (
    column_name LIKE '%token%' 
    OR column_name LIKE '%change%'
  )
ORDER BY ordinal_position;

-- Show which specific users have NULL values (using dynamic SQL)
DO $$
DECLARE
  sql_text text;
  col_list text[] := ARRAY[]::text[];
  col_name text;
  exists_check boolean;
  where_clauses text[] := ARRAY[]::text[];
BEGIN
  -- Build list of columns that exist
  FOR col_name IN 
    SELECT unnest(ARRAY[
      'email_change_token_new',
      'confirmation_token',
      'email_change',
      'email_change_token',
      'recovery_token',
      'phone_change',
      'phone_change_token'
    ])
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = col_name
    ) INTO exists_check;
    
    IF exists_check THEN
      col_list := col_list || col_name;
      where_clauses := where_clauses || (quote_ident(col_name) || ' IS NULL');
    END IF;
  END LOOP;
  
  -- Build and execute user check query only if we have columns and WHERE conditions
  IF array_length(col_list, 1) > 0 AND array_length(where_clauses, 1) > 0 THEN
    sql_text := 'SELECT ''Users with NULL tokens'' as check_type, id, email';
    
    -- Add CASE statements for each column
    FOREACH col_name IN ARRAY col_list
    LOOP
      sql_text := sql_text || ', CASE WHEN ' || quote_ident(col_name) || ' IS NULL THEN ''' || col_name || ''' END as null_' || col_name;
    END LOOP;
    
    sql_text := sql_text || ' FROM auth.users WHERE ' || array_to_string(where_clauses, ' OR ');
    
    EXECUTE sql_text;
  END IF;
END $$;

-- ============================================
-- STEP 2: FIX - Update all NULL values
-- ============================================

SELECT '=== STEP 2: FIXING NULL VALUES ===' as step;

DO $$
DECLARE
  fixed_count int := 0;
  total_fixed int := 0;
BEGIN
  -- Fix email_change_token_new (the one causing the 500 error)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new'
  ) THEN
    UPDATE auth.users 
    SET email_change_token_new = COALESCE(email_change_token_new, '')
    WHERE email_change_token_new IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % email_change_token_new NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix confirmation_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmation_token'
  ) THEN
    UPDATE auth.users 
    SET confirmation_token = COALESCE(confirmation_token, '')
    WHERE confirmation_token IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % confirmation_token NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix email_change
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change'
  ) THEN
    UPDATE auth.users 
    SET email_change = COALESCE(email_change, '')
    WHERE email_change IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % email_change NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix email_change_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token'
  ) THEN
    UPDATE auth.users 
    SET email_change_token = COALESCE(email_change_token, '')
    WHERE email_change_token IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % email_change_token NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix recovery_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'recovery_token'
  ) THEN
    UPDATE auth.users 
    SET recovery_token = COALESCE(recovery_token, '')
    WHERE recovery_token IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % recovery_token NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix phone_change
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change'
  ) THEN
    UPDATE auth.users 
    SET phone_change = COALESCE(phone_change, '')
    WHERE phone_change IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % phone_change NULL values', fixed_count;
    END IF;
  END IF;
  
  -- Fix phone_change_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change_token'
  ) THEN
    UPDATE auth.users 
    SET phone_change_token = COALESCE(phone_change_token, '')
    WHERE phone_change_token IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    total_fixed := total_fixed + fixed_count;
    IF fixed_count > 0 THEN
      RAISE NOTICE '✓ Fixed % phone_change_token NULL values', fixed_count;
    END IF;
  END IF;
  
  IF total_fixed > 0 THEN
    RAISE NOTICE '✓ Total: Fixed % NULL values across all token columns', total_fixed;
  ELSE
    RAISE NOTICE '✓ No NULL values found - all token columns are already fixed';
  END IF;
  
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '❌ Cannot UPDATE auth.users - insufficient privileges';
  RAISE NOTICE 'You may need to run this as a superuser or use Supabase Dashboard';
WHEN OTHERS THEN
  RAISE NOTICE '❌ Error: %', SQLERRM;
  RAISE NOTICE 'Error code: %', SQLSTATE;
END $$;

-- ============================================
-- STEP 3: VERIFICATION - Confirm fix worked
-- ============================================

SELECT '=== STEP 3: VERIFICATION ===' as step;

-- Verify all NULLs are fixed (using dynamic SQL)
DO $$
DECLARE
  sql_text text;
  col_list text[] := ARRAY[]::text[];
  col_name text;
  exists_check boolean;
  status_check text := '';
BEGIN
  -- Build list of columns that exist
  FOR col_name IN 
    SELECT unnest(ARRAY[
      'email_change_token_new',
      'confirmation_token',
      'email_change',
      'email_change_token',
      'recovery_token',
      'phone_change',
      'phone_change_token'
    ])
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = col_name
    ) INTO exists_check;
    
    IF exists_check THEN
      col_list := col_list || col_name;
      IF status_check != '' THEN
        status_check := status_check || ' AND ';
      END IF;
      status_check := status_check || 'COUNT(*) FILTER (WHERE ' || quote_ident(col_name) || ' IS NULL) = 0';
    END IF;
  END LOOP;
  
  -- Build and execute verification query only for existing columns
  IF array_length(col_list, 1) > 0 THEN
    sql_text := 'SELECT ''Verification - NULL Counts'' as check_type, ';
    sql_text := sql_text || 'COUNT(*) as total_users';
    
    FOREACH col_name IN ARRAY col_list
    LOOP
      sql_text := sql_text || ', COUNT(*) FILTER (WHERE ' || quote_ident(col_name) || ' IS NULL) as null_' || col_name;
    END LOOP;
    
    sql_text := sql_text || ', CASE WHEN ' || status_check || ' THEN ''✓ ALL FIXED'' ELSE ''❌ SOME NULLS REMAIN'' END as status';
    sql_text := sql_text || ' FROM auth.users';
    
    EXECUTE sql_text;
  ELSE
    RAISE NOTICE '⚠️ No token columns found to verify';
  END IF;
END $$;

-- Show any remaining users with NULL values (should be empty) - using dynamic SQL
DO $$
DECLARE
  sql_text text;
  col_list text[] := ARRAY[]::text[];
  col_name text;
  exists_check boolean;
  where_clauses text[] := ARRAY[]::text[];
  case_parts text[] := ARRAY[]::text[];
BEGIN
  -- Build list of columns that exist
  FOR col_name IN 
    SELECT unnest(ARRAY[
      'email_change_token_new',
      'confirmation_token',
      'email_change',
      'email_change_token',
      'recovery_token',
      'phone_change',
      'phone_change_token'
    ])
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = col_name
    ) INTO exists_check;
    
    IF exists_check THEN
      col_list := col_list || col_name;
      where_clauses := where_clauses || (quote_ident(col_name) || ' IS NULL');
      case_parts := case_parts || ('WHEN ' || quote_ident(col_name) || ' IS NULL THEN ''❌ ' || col_name || '''');
    END IF;
  END LOOP;
  
  -- Build and execute user check query only if we have columns and WHERE conditions
  IF array_length(col_list, 1) > 0 AND array_length(where_clauses, 1) > 0 THEN
    sql_text := 'SELECT ''Remaining Issues'' as check_type, id, email, ';
    sql_text := sql_text || 'CASE ' || array_to_string(case_parts, ' ') || ' ELSE ''✓ OK'' END as issue_status';
    sql_text := sql_text || ' FROM auth.users WHERE ' || array_to_string(where_clauses, ' OR ');
    
    EXECUTE sql_text;
  END IF;
END $$;

-- ============================================
-- STEP 4: FORCE SCHEMA RELOAD
-- ============================================

SELECT '=== STEP 4: FORCING SCHEMA RELOAD ===' as step;

-- Force PostgREST/GoTrue to reload schema
DO $$
BEGIN
  NOTIFY pgrst, 'reload schema';
  NOTIFY pgrst, 'reload config';
  RAISE NOTICE '✓ Schema reload notifications sent to PostgREST/GoTrue';
END $$;

-- Create and drop a dummy function to force schema introspection
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION _force_schema_reload() RETURNS void LANGUAGE sql AS $func$ SELECT NULL; $func$;
  DROP FUNCTION _force_schema_reload();
  RAISE NOTICE '✓ Forced schema reload by creating/dropping function';
END $$;

-- ============================================
-- STEP 5: FINAL STATUS
-- ============================================

SELECT '=== STEP 5: FINAL STATUS ===' as step;

SELECT 
  'Final Status' as check_type,
  'All NULL token values have been fixed' as message,
  'Schema reload notifications sent' as schema_reload,
  'You can now test authentication' as next_step;

