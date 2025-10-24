-- Cleanup and diagnostic SQL for auth issues
-- Run this in Supabase SQL Editor

-- 1. Check what users exist
SELECT 
  id, 
  email, 
  email_confirmed_at, 
  created_at,
  raw_app_meta_data,
  aud,
  role
FROM auth.users 
WHERE email ILIKE '%passarthur%' OR email = 'passarthur2003@icloud.com';

-- 2. Check identities
SELECT 
  id,
  provider,
  provider_id,
  user_id,
  created_at
FROM auth.identities 
WHERE provider_id ILIKE '%passarthur%' OR provider_id = 'passarthur2003@icloud.com';

-- 3. Clean up any existing test user
DELETE FROM auth.identities WHERE provider_id = 'passarthur2003@icloud.com';
DELETE FROM auth.users WHERE email = 'passarthur2003@icloud.com';

-- 4. Create a diagnostic function to check auth config
CREATE OR REPLACE FUNCTION public.check_auth_config()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  user_count int;
  identity_count int;
BEGIN
  -- Count users and identities
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO identity_count FROM auth.identities;
  
  result := json_build_object(
    'total_users', user_count,
    'total_identities', identity_count,
    'test_user_exists', EXISTS(SELECT 1 FROM auth.users WHERE email = 'passarthur2003@icloud.com'),
    'extensions_loaded', json_build_object(
      'uuid_ossp', EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'),
      'pgcrypto', EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
    )
  );
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_auth_config() TO service_role;

-- 5. Create a safe user creation function that handles conflicts
CREATE OR REPLACE FUNCTION public.create_test_user_safe(user_email text, user_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
  existing_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO existing_user_id FROM auth.users WHERE email = user_email;
  
  IF existing_user_id IS NOT NULL THEN
    -- User exists, delete and recreate
    DELETE FROM auth.identities WHERE user_id = existing_user_id;
    DELETE FROM auth.users WHERE id = existing_user_id;
  END IF;
  
  -- Generate new user ID
  v_user_id := gen_random_uuid();
  
  -- Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    role,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    last_sign_in_at,
    confirmation_sent_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    jsonb_build_object('full_name', 'Test User'),
    false,
    now(),
    now(),
    now(),
    now()
  );

  -- Insert into auth.identities
  INSERT INTO auth.identities (
    id,
    provider,
    provider_id,
    user_id,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    'email',
    user_email,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', user_email,
      'email_verified', true,
      'provider', 'email'
    ),
    now(),
    now(),
    now()
  );

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, 'Test User')
  ON CONFLICT (user_id) DO NOTHING;

  -- Return result
  v_result := json_build_object(
    'user_id', v_user_id,
    'email', user_email,
    'created_at', now(),
    'method', 'sql_safe'
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Safe user creation failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_test_user_safe(text, text) TO service_role;
