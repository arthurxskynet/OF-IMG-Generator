-- ============================================
-- FIX EMAIL_CHANGE_TOKEN_NEW NULL VALUES
-- This fixes the 500 error: "converting NULL to string is unsupported"
-- ============================================

DO $$
DECLARE
  fixed_count int := 0;
  col_exists boolean;
BEGIN
  -- Check if email_change_token_new column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'email_change_token_new'
  ) INTO col_exists;
  
  IF col_exists THEN
    -- Fix NULL values in email_change_token_new
    UPDATE auth.users 
    SET email_change_token_new = COALESCE(email_change_token_new, '')
    WHERE email_change_token_new IS NULL;
    
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE '✓ Fixed % email_change_token_new NULL values', fixed_count;
    
    -- Also fix any other token columns that might have NULLs
    -- This is a comprehensive fix for all token-related columns
    
    -- Fix confirmation_token
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmation_token'
    ) THEN
      UPDATE auth.users 
      SET confirmation_token = COALESCE(confirmation_token, '')
      WHERE confirmation_token IS NULL;
      GET DIAGNOSTICS fixed_count = ROW_COUNT;
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
      IF fixed_count > 0 THEN
        RAISE NOTICE '✓ Fixed % phone_change_token NULL values', fixed_count;
      END IF;
    END IF;
    
    RAISE NOTICE '✓ All NULL token fields have been fixed';
    
  ELSE
    RAISE NOTICE '⚠️ email_change_token_new column does not exist in auth.users';
    RAISE NOTICE 'This might be a different Supabase version or the column was removed';
  END IF;
  
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '❌ Cannot UPDATE auth.users - insufficient privileges';
  RAISE NOTICE 'You may need to run this as a superuser or use Supabase Dashboard';
WHEN OTHERS THEN
  RAISE NOTICE '❌ Error: %', SQLERRM;
  RAISE NOTICE 'Error code: %', SQLSTATE;
END $$;

-- Verify the fix (using dynamic SQL to only check columns that exist)
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
  
  -- Build and execute verification query only for existing columns
  IF array_length(col_list, 1) > 0 THEN
    sql_text := 'SELECT ''Verification - NULL Counts'' as check_type, ';
    sql_text := sql_text || 'COUNT(*) as total_users';
    
    FOREACH col_name IN ARRAY col_list
    LOOP
      sql_text := sql_text || ', COUNT(*) FILTER (WHERE ' || quote_ident(col_name) || ' IS NULL) as null_' || col_name;
    END LOOP;
    
    sql_text := sql_text || ' FROM auth.users';
    
    EXECUTE sql_text;
  ELSE
    RAISE NOTICE '⚠️ No token columns found to verify';
  END IF;
END $$;

-- Show which users had issues (using dynamic SQL)
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
      sql_text := sql_text || ', CASE WHEN ' || quote_ident(col_name) || ' IS NULL THEN ''❌ ' || col_name || ''' END as null_' || col_name;
    END LOOP;
    
    sql_text := sql_text || ' FROM auth.users WHERE ' || array_to_string(where_clauses, ' OR ');
    
    EXECUTE sql_text;
  END IF;
END $$;

-- Force schema reload for PostgREST/GoTrue
DO $$
BEGIN
  NOTIFY pgrst, 'reload schema';
  NOTIFY pgrst, 'reload config';
  RAISE NOTICE '✓ Schema reload notifications sent';
END $$;

