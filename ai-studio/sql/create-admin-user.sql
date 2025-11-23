-- Create admin user account
-- Email: arthurmarshall@cosa-ai.co.uk
-- Run this in Supabase SQL Editor

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_email text := 'arthurmarshall@cosa-ai.co.uk';
  v_password text := 'Admin123!@#'; -- Change this password after first login
  v_user_id uuid;
  v_existing_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_existing_user_id IS NOT NULL THEN
    RAISE NOTICE 'User with email % already exists with ID: %', v_email, v_existing_user_id;
    
    -- Update existing profile to be admin
    UPDATE public.profiles 
    SET is_admin = true 
    WHERE user_id = v_existing_user_id;
    
    RAISE NOTICE 'Updated existing user to admin';
  ELSE
    -- Generate user ID using uuid_generate_v4() for consistency
    v_user_id := uuid_generate_v4();
    
    -- Insert into auth.users
    -- Use empty jsonb for raw_user_meta_data (full_name goes in profiles table)
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
      '{}'::jsonb,  -- Empty jsonb - metadata goes in profiles table
      false,
      now(),
      now(),
      now(),
      now()
    );
    
    -- Insert into auth.identities
    -- Use simpler identity_data structure
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
    
    RAISE NOTICE 'Created admin user with ID: %', v_user_id;
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE 'Password: % (CHANGE THIS AFTER FIRST LOGIN)', v_password;
  END IF;
END $$;

