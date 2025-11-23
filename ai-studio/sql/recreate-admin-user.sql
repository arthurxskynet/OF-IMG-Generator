-- Delete and recreate admin user correctly
-- Email: arthurmarshall@cosa-ai.co.uk
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_email text := 'arthurmarshall@cosa-ai.co.uk';
  v_password text := 'Admin123!@#';
  v_user_id uuid;
  v_existing_user_id uuid;
BEGIN
  -- Check if user exists and delete it
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_existing_user_id IS NOT NULL THEN
    RAISE NOTICE 'Deleting existing user with ID: %', v_existing_user_id;
    DELETE FROM auth.identities WHERE user_id = v_existing_user_id;
    DELETE FROM auth.users WHERE id = v_existing_user_id;
    DELETE FROM public.profiles WHERE user_id = v_existing_user_id;
  END IF;
  
  -- Generate new user ID
  v_user_id := uuid_generate_v4();
  
  -- Insert into auth.users with correct structure
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
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    '{}'::jsonb,
    false,
    now(),
    now(),
    now(),
    now()
  );
  
  -- Insert into auth.identities with correct structure
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
    uuid_generate_v4(),
    'email',
    v_email,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text, 
      'email', v_email, 
      'email_verified', true
    ),
    now(),
    now(),
    now()
  );
  
  -- Create profile with admin flag
  INSERT INTO public.profiles (user_id, full_name, is_admin)
  VALUES (v_user_id, 'Admin User', true)
  ON CONFLICT (user_id) DO UPDATE SET is_admin = true;
  
  RAISE NOTICE '✅ Successfully created admin user with ID: %', v_user_id;
  RAISE NOTICE '   Email: %', v_email;
  RAISE NOTICE '   Password: % (CHANGE THIS AFTER FIRST LOGIN)', v_password;
  RAISE NOTICE '   Admin flag: true';
END $$;

