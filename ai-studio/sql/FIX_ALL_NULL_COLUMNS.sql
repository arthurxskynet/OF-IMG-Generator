-- ============================================
-- FIX ALL NULL COLUMNS IN AUTH.USERS
-- This fixes all possible NULL token/change columns
-- ============================================

DO $$
DECLARE
  fixed_count int := 0;
BEGIN
  -- Fix confirmation_token
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmation_token'
  ) THEN
    UPDATE auth.users 
    SET confirmation_token = COALESCE(confirmation_token, '')
    WHERE confirmation_token IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % confirmation_token NULL values', fixed_count;
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
    RAISE NOTICE 'Fixed % email_change NULL values', fixed_count;
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
    RAISE NOTICE 'Fixed % email_change_token NULL values', fixed_count;
  END IF;
  
  -- Fix email_change_token_new (the one causing the 500 error)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new'
  ) THEN
    UPDATE auth.users 
    SET email_change_token_new = COALESCE(email_change_token_new, '')
    WHERE email_change_token_new IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % email_change_token_new NULL values', fixed_count;
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
    RAISE NOTICE 'Fixed % recovery_token NULL values', fixed_count;
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
    RAISE NOTICE 'Fixed % phone_change NULL values', fixed_count;
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
    RAISE NOTICE 'Fixed % phone_change_token NULL values', fixed_count;
  END IF;
  
  RAISE NOTICE 'All NULL token fields fixed';
  
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot UPDATE auth.users - use Supabase Dashboard';
  RAISE NOTICE 'Go to Dashboard → Authentication → Users and edit/save each user';
WHEN OTHERS THEN
  RAISE NOTICE 'Error: %', SQLERRM;
END $$;

-- Verify all NULLs are fixed (using dynamic SQL to only check columns that exist)
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
    sql_text := 'SELECT ''Verification'' as check_type, ';
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

