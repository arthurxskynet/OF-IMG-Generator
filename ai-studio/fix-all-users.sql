-- Comprehensive fix for all SQL-created users
-- This script recreates all users using the working pattern
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to safely create/update a user
CREATE OR REPLACE FUNCTION public.create_user_safe(
  user_email text,
  user_password text,
  user_full_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = user_email;
  
  IF v_user_id IS NULL THEN
    -- Create new user
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
      uuid_generate_v4(),  -- Use uuid_generate_v4() instead of gen_random_uuid()
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      user_email,
      crypt(user_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers', array['email']),
      '{}'::jsonb,  -- Use empty jsonb
      false,
      now(),
      now(),
      now(),
      now()
    )
    RETURNING id INTO v_user_id;
    
    v_result := json_build_object('action', 'created', 'user_id', v_user_id);
  ELSE
    -- Update existing user
    UPDATE auth.users
    SET encrypted_password = crypt(user_password, gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
    
    v_result := json_build_object('action', 'updated', 'user_id', v_user_id);
  END IF;

  -- Ensure email identity exists (upsert logic)
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities
    WHERE provider = 'email' AND user_id = v_user_id
  ) THEN
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
      user_email,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', user_email, 'email_verified', true),
      now(),
      now(),
      now()
    );
  ELSE
    -- Update existing identity
    UPDATE auth.identities
    SET identity_data = jsonb_build_object('sub', v_user_id::text, 'email', user_email, 'email_verified', true),
        updated_at = now()
    WHERE provider = 'email' AND user_id = v_user_id;
  END IF;

  -- Create/update profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, COALESCE(user_full_name, split_part(user_email, '@', 1)))
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  RETURN v_result;
END;
$$;

-- Clean up existing problematic users
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);
DELETE FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);

-- Recreate users using the working pattern
SELECT public.create_user_safe('15nicholls444@gmail.com', 'PasswordCosa4', 'Nicholls User') as nicholls_result;
SELECT public.create_user_safe('Neickomarsh02@gmail.com', 'PUMPUMaccess1', 'Neicko User') as neicko_result;

-- Verify the users were created correctly
SELECT 
  'Verification' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL as confirmed,
  u.instance_id,
  u.aud,
  u.role,
  i.provider,
  i.identity_data->'email_verified' as email_verified
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com', 'passarthur2003@icloud.com')
ORDER BY u.email;

-- Clean up the function
DROP FUNCTION public.create_user_safe(text, text, text);
