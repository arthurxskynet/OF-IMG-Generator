-- Create user account for 15nicholls444@gmail.com
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up any existing user with this email to avoid conflicts
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = '15nicholls444@gmail.com'
);
DELETE FROM auth.users WHERE email = '15nicholls444@gmail.com';
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = '15nicholls444@gmail.com'
);

-- Create the new user
DO $$
DECLARE
  v_email text := '15nicholls444@gmail.com';
  v_password text := 'PasswordCosa4';
  v_user_id uuid;
BEGIN
  -- Insert user into auth.users
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
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    jsonb_build_object('full_name', 'Nicholls User'),
    false,
    now(),
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  -- Insert identity into auth.identities
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
    v_email,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text, 
      'email', v_email, 
      'email_verified', true,
      'provider', 'email'
    ),
    now(),
    now(),
    now()
  );

  -- Create profile in public.profiles
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, 'Nicholls User')
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  RAISE NOTICE 'Successfully created user with ID: % and email: %', v_user_id, v_email;
END $$;
