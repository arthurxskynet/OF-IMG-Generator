-- Complete Admin Setup Script
-- Run this script to ensure everything is set up correctly
-- This script is idempotent - safe to run multiple times

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- STEP 1: Run the admin migration
-- ============================================
-- Add is_admin column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Create helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, anon;

-- Update existing profiles to ensure is_admin is false (safety)
UPDATE public.profiles SET is_admin = false WHERE is_admin IS NULL;

-- ============================================
-- STEP 2: Create admin user
-- ============================================
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

-- ============================================
-- STEP 3: Create storage helper function
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_id_from_storage_path(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' THEN
      (regexp_split_to_array(path, '/'))[1]::uuid
    ELSE
      NULL::uuid
  END;
$$;

-- ============================================
-- STEP 4: Verify setup
-- ============================================
DO $$
DECLARE
  admin_count int;
  function_count int;
BEGIN
  -- Check admin user
  SELECT COUNT(*) INTO admin_count
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE u.email = 'arthurmarshall@cosa-ai.co.uk' AND p.is_admin = true;
  
  -- Check functions
  SELECT COUNT(*) INTO function_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN ('is_admin_user', 'get_user_id_from_storage_path');
  
  IF admin_count > 0 AND function_count = 2 THEN
    RAISE NOTICE '✅ Admin setup complete!';
    RAISE NOTICE '   - Admin user: arthurmarshall@cosa-ai.co.uk';
    RAISE NOTICE '   - Helper functions: Created';
  ELSE
    RAISE WARNING '⚠️  Setup incomplete:';
    RAISE WARNING '   - Admin users found: %', admin_count;
    RAISE WARNING '   - Functions found: %', function_count;
  END IF;
END $$;

