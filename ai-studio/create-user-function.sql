-- Create a SQL function to create users directly
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION create_test_user_sql(user_email text, user_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  -- Generate user ID
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
    'created_at', now()
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'User creation failed: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_test_user_sql(text, text) TO service_role;

