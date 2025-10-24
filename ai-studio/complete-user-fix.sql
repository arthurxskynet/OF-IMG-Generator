-- Complete User Records Fix and Verification
-- This script ensures all users can sign in seamlessly
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Step 1: Complete diagnostic check
SELECT '=== DIAGNOSTIC CHECK ===' as step;

-- Check all existing users
SELECT 
  'Current Users' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL as confirmed,
  u.instance_id,
  u.aud,
  u.role,
  u.raw_app_meta_data,
  u.raw_user_meta_data,
  u.created_at
FROM auth.users u
ORDER BY u.created_at;

-- Check all identities
SELECT 
  'Current Identities' as check_type,
  i.id,
  i.provider,
  i.provider_id,
  i.user_id,
  i.identity_data,
  i.created_at
FROM auth.identities i
ORDER BY i.created_at;

-- Check for missing identities
SELECT 
  'Missing Identities' as check_type,
  u.id,
  u.email,
  'No identity record' as issue
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE i.id IS NULL;

-- Check extensions
SELECT 
  'Extensions Status' as check_type,
  extname as extension_name,
  extversion as version
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt')
ORDER BY extname;

-- Step 2: Clean up all problematic users
SELECT '=== CLEANING UP PROBLEMATIC USERS ===' as step;

-- Delete all users except the working one
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);
DELETE FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);

-- Step 3: Create perfect user creation function
CREATE OR REPLACE FUNCTION public.create_perfect_user(
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
  -- Generate user ID using the same method as working user
  v_user_id := uuid_generate_v4();
  
  -- Insert user with EXACT same structure as working user
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
    '{}'::jsonb,
    false,
    now(),
    now(),
    now(),
    now()
  );

  -- Insert identity with EXACT same structure as working user
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

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, COALESCE(user_full_name, split_part(user_email, '@', 1)))
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  v_result := json_build_object(
    'action', 'created',
    'user_id', v_user_id,
    'email', user_email,
    'status', 'success'
  );

  RETURN v_result;
END;
$$;

-- Step 4: Create the users
SELECT '=== CREATING USERS ===' as step;

-- Create Nicholls user
SELECT public.create_perfect_user('15nicholls444@gmail.com', 'PasswordCosa4', 'Nicholls User') as nicholls_result;

-- Create Neicko user  
SELECT public.create_perfect_user('Neickomarsh02@gmail.com', 'PUMPUMaccess1', 'Neicko User') as neicko_result;

-- Step 5: Verify all users are correct
SELECT '=== VERIFICATION ===' as step;

-- Check all users after creation
SELECT 
  'Final User Check' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL as confirmed,
  u.instance_id,
  u.aud,
  u.role,
  u.raw_app_meta_data,
  u.raw_user_meta_data,
  u.created_at
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Check all identities after creation
SELECT 
  'Final Identity Check' as check_type,
  i.id,
  i.provider,
  i.provider_id,
  i.user_id,
  i.identity_data,
  i.created_at
FROM auth.identities i
JOIN auth.users u ON i.user_id = u.id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Check profiles
SELECT 
  'Final Profile Check' as check_type,
  p.user_id,
  p.full_name,
  u.email
FROM public.profiles p
JOIN auth.users u ON p.user_id = u.id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 6: Data consistency check
SELECT '=== CONSISTENCY CHECK ===' as step;

-- Check for any data inconsistencies
SELECT 
  'Data Consistency' as check_type,
  u.email,
  CASE 
    WHEN u.email_confirmed_at IS NULL THEN '❌ email_confirmed_at is NULL'
    WHEN u.instance_id IS NULL THEN '❌ instance_id is NULL'
    WHEN u.aud IS NULL THEN '❌ instance_id is NULL'
    WHEN u.role IS NULL THEN '❌ role is NULL'
    WHEN u.raw_app_meta_data IS NULL THEN '❌ raw_app_meta_data is NULL'
    WHEN u.raw_user_meta_data IS NULL THEN '❌ raw_user_meta_data is NULL'
    WHEN i.identity_data->'email_verified' IS NULL THEN '❌ email_verified in identity is NULL'
    WHEN i.identity_data->'sub' IS NULL THEN '❌ sub in identity is NULL'
    WHEN i.identity_data->'email' IS NULL THEN '❌ email in identity is NULL'
    ELSE '✅ All data is consistent'
  END as status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 7: Clean up function
DROP FUNCTION public.create_perfect_user(text, text, text);

-- Final summary
SELECT '=== SUMMARY ===' as step;
SELECT 
  'User Count' as metric,
  COUNT(*) as value
FROM auth.users
WHERE email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');

SELECT 
  'Identity Count' as metric,
  COUNT(*) as value
FROM auth.identities i
JOIN auth.users u ON i.user_id = u.id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');

SELECT 
  'Profile Count' as metric,
  COUNT(*) as value
FROM public.profiles p
JOIN auth.users u ON p.user_id = u.id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');

SELECT '=== SCRIPT COMPLETED ===' as step;
