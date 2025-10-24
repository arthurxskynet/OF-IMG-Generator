-- Exact User Replication Script
-- This script replicates the EXACT structure of the working user
-- Based on analysis of passarthur2003@icloud.com

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Step 1: Clean up existing problematic users
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);
DELETE FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);

-- Step 2: Create function to replicate exact working user structure
CREATE OR REPLACE FUNCTION public.replicate_working_user_structure(
  user_email text,
  user_password text,
  user_full_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_identity_id uuid;
  v_result json;
BEGIN
  -- Generate IDs using the same method as working user
  v_user_id := uuid_generate_v4();
  v_identity_id := uuid_generate_v4();
  
  -- Insert user with EXACT same structure as working user
  -- Based on working user analysis:
  -- - user_metadata: {"full_name": "Test User"}
  -- - app_metadata: {"provider": "email", "providers": ["email"]}
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
    jsonb_build_object('full_name', user_full_name),  -- KEY: Use full_name in user_metadata
    false,
    now(),
    now(),
    now(),
    now()
  );

  -- Insert identity with EXACT same structure as working user
  -- Based on working user analysis:
  -- - identity_data includes: sub, email, email_verified, provider
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
    v_identity_id,
    'email',
    user_email,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text, 
      'email', user_email, 
      'email_verified', true,
      'provider', 'email'  -- KEY: Include provider in identity_data
    ),
    now(),
    now(),
    now()
  );

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, user_full_name)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  v_result := json_build_object(
    'action', 'created',
    'user_id', v_user_id,
    'identity_id', v_identity_id,
    'email', user_email,
    'status', 'success'
  );

  RETURN v_result;
END;
$$;

-- Step 3: Create the users with exact working structure
SELECT '=== CREATING NICHOLLS USER ===' as step;
SELECT public.replicate_working_user_structure('15nicholls444@gmail.com', 'PasswordCosa4', 'Nicholls User') as nicholls_result;

SELECT '=== CREATING NEICKO USER ===' as step;
SELECT public.replicate_working_user_structure('Neickomarsh02@gmail.com', 'PUMPUMaccess1', 'Neicko User') as neicko_result;

-- Step 4: Verify the structure matches working user
SELECT '=== VERIFICATION ===' as step;

-- Compare user metadata structure
SELECT 
  'User Metadata Comparison' as check_type,
  u.email,
  u.raw_user_meta_data,
  CASE 
    WHEN u.raw_user_meta_data ? 'full_name' THEN '✅ Has full_name'
    ELSE '❌ Missing full_name'
  END as metadata_status
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Compare identity data structure
SELECT 
  'Identity Data Comparison' as check_type,
  u.email,
  i.identity_data,
  CASE 
    WHEN i.identity_data ? 'provider' THEN '✅ Has provider in identity_data'
    ELSE '❌ Missing provider in identity_data'
  END as identity_status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 5: Clean up function
DROP FUNCTION public.replicate_working_user_structure(text, text, text);

-- Final summary
SELECT '=== FINAL SUMMARY ===' as step;
SELECT 
  'All users created with exact working user structure' as message,
  'Test authentication now' as next_step;
