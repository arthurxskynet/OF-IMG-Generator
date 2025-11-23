-- ============================================
-- TEST THE EXACT QUERY GOTrue MAKES
-- This simulates what happens during login
-- ============================================

-- Test 1: Try to query auth.users the way GoTrue does (with all columns)
DO $$
DECLARE
  test_user RECORD;
BEGIN
  -- This is similar to what GoTrue does when finding a user
  SELECT * INTO test_user
  FROM auth.users
  WHERE email = 'passarthur2003@icloud.com'
  LIMIT 1;
  
  IF test_user.id IS NOT NULL THEN
    RAISE NOTICE '✓ Can query auth.users with SELECT *';
  ELSE
    RAISE NOTICE '⚠️ User not found (this is OK if user does not exist)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ ERROR querying auth.users: %', SQLERRM;
  RAISE NOTICE 'This is the problem! Error code: %', SQLSTATE;
END $$;

-- Test 2: Try to scan all columns individually (this is what GoTrue does)
DO $$
DECLARE
  test_id uuid;
  test_email text;
  test_confirmation_token text;
  test_email_change text;
BEGIN
  SELECT 
    id,
    email,
    confirmation_token,
    email_change
  INTO 
    test_id,
    test_email,
    test_confirmation_token,
    test_email_change
  FROM auth.users
  WHERE email = 'passarthur2003@icloud.com'
  LIMIT 1;
  
  RAISE NOTICE '✓ Can scan all columns successfully';
  RAISE NOTICE 'User ID: %, Email: %', test_id, test_email;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ ERROR scanning columns: %', SQLERRM;
  RAISE NOTICE 'Error code: %', SQLSTATE;
  RAISE NOTICE 'This is the exact error GoTrue is getting!';
END $$;

-- Test 3: Check if there are any computed columns or generated columns
SELECT 
  'Column Details' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
  AND (column_name LIKE '%token%' OR column_name LIKE '%change%')
ORDER BY ordinal_position;

-- Test 4: Try to insert a test row (simulate user creation)
DO $$
DECLARE
  test_id uuid := uuid_generate_v4();
BEGIN
  -- Try a minimal insert to see if there are constraint issues
  INSERT INTO auth.users (
    id, instance_id, role, aud, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
  ) VALUES (
    test_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'test-' || test_id::text || '@example.com',
    crypt('test', gen_salt('bf')),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    false,
    now(),
    now()
  );
  
  -- Clean up
  DELETE FROM auth.users WHERE id = test_id;
  
  RAISE NOTICE '✓ Can insert into auth.users';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ ERROR inserting into auth.users: %', SQLERRM;
  RAISE NOTICE 'This might be the issue!';
END $$;

