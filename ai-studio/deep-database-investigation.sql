-- Deep Database Investigation
-- This script will examine the actual database records to find the root cause
-- Run this in Supabase SQL Editor

-- Step 1: Get the exact database structure of all users
SELECT '=== USER RECORDS COMPARISON ===' as step;

SELECT 
  'User Records' as check_type,
  u.id,
  u.email,
  u.instance_id,
  u.aud,
  u.role,
  u.email_confirmed_at,
  u.encrypted_password IS NOT NULL as has_password,
  u.raw_app_meta_data,
  u.raw_user_meta_data,
  u.is_super_admin,
  u.created_at,
  u.updated_at,
  u.last_sign_in_at,
  u.confirmation_sent_at,
  u.email_change_sent_at,
  u.recovery_sent_at,
  u.invited_at,
  u.confirmation_token,
  u.recovery_token,
  u.email_change_token_new,
  u.email_change
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 2: Get the exact identity records
SELECT '=== IDENTITY RECORDS COMPARISON ===' as step;

SELECT 
  'Identity Records' as check_type,
  i.id,
  i.provider,
  i.provider_id,
  i.user_id,
  i.identity_data,
  i.last_sign_in_at,
  i.created_at,
  i.updated_at
FROM auth.identities i
JOIN auth.users u ON i.user_id = u.id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 3: Check for any NULL or problematic fields
SELECT '=== NULL FIELD CHECK ===' as step;

SELECT 
  'NULL Fields Check' as check_type,
  u.email,
  CASE 
    WHEN u.id IS NULL THEN '❌ id is NULL'
    WHEN u.instance_id IS NULL THEN '❌ instance_id is NULL'
    WHEN u.aud IS NULL THEN '❌ aud is NULL'
    WHEN u.role IS NULL THEN '❌ role is NULL'
    WHEN u.email IS NULL THEN '❌ email is NULL'
    WHEN u.encrypted_password IS NULL THEN '❌ encrypted_password is NULL'
    WHEN u.email_confirmed_at IS NULL THEN '❌ email_confirmed_at is NULL'
    WHEN u.raw_app_meta_data IS NULL THEN '❌ raw_app_meta_data is NULL'
    WHEN u.raw_user_meta_data IS NULL THEN '❌ raw_user_meta_data is NULL'
    WHEN u.is_super_admin IS NULL THEN '❌ is_super_admin is NULL'
    WHEN u.created_at IS NULL THEN '❌ created_at is NULL'
    WHEN u.updated_at IS NULL THEN '❌ updated_at is NULL'
    ELSE '✅ No NULL fields in user record'
  END as user_status,
  CASE 
    WHEN i.id IS NULL THEN '❌ identity id is NULL'
    WHEN i.provider IS NULL THEN '❌ identity provider is NULL'
    WHEN i.provider_id IS NULL THEN '❌ identity provider_id is NULL'
    WHEN i.user_id IS NULL THEN '❌ identity user_id is NULL'
    WHEN i.identity_data IS NULL THEN '❌ identity_data is NULL'
    WHEN i.created_at IS NULL THEN '❌ identity created_at is NULL'
    WHEN i.updated_at IS NULL THEN '❌ identity updated_at is NULL'
    ELSE '✅ No NULL fields in identity record'
  END as identity_status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 4: Check for data type issues
SELECT '=== DATA TYPE CHECK ===' as step;

SELECT 
  'Data Type Check' as check_type,
  u.email,
  pg_typeof(u.id) as id_type,
  pg_typeof(u.instance_id) as instance_id_type,
  pg_typeof(u.aud) as aud_type,
  pg_typeof(u.role) as role_type,
  pg_typeof(u.raw_app_meta_data) as app_meta_type,
  pg_typeof(u.raw_user_meta_data) as user_meta_type,
  pg_typeof(i.identity_data) as identity_data_type
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 5: Check for JSON structure issues
SELECT '=== JSON STRUCTURE CHECK ===' as step;

SELECT 
  'JSON Structure Check' as check_type,
  u.email,
  CASE 
    WHEN jsonb_typeof(u.raw_app_meta_data) = 'object' THEN '✅ app_meta_data is object'
    ELSE '❌ app_meta_data is not object: ' || jsonb_typeof(u.raw_app_meta_data)
  END as app_meta_status,
  CASE 
    WHEN jsonb_typeof(u.raw_user_meta_data) = 'object' THEN '✅ user_meta_data is object'
    ELSE '❌ user_meta_data is not object: ' || jsonb_typeof(u.raw_user_meta_data)
  END as user_meta_status,
  CASE 
    WHEN jsonb_typeof(i.identity_data) = 'object' THEN '✅ identity_data is object'
    ELSE '❌ identity_data is not object: ' || jsonb_typeof(i.identity_data)
  END as identity_data_status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 6: Check for specific JSON field issues
SELECT '=== JSON FIELD CHECK ===' as step;

SELECT 
  'JSON Field Check' as check_type,
  u.email,
  CASE 
    WHEN u.raw_app_meta_data ? 'provider' THEN '✅ app_meta has provider'
    ELSE '❌ app_meta missing provider'
  END as app_provider_status,
  CASE 
    WHEN u.raw_app_meta_data ? 'providers' THEN '✅ app_meta has providers'
    ELSE '❌ app_meta missing providers'
  END as app_providers_status,
  CASE 
    WHEN u.raw_user_meta_data ? 'full_name' THEN '✅ user_meta has full_name'
    ELSE '❌ user_meta missing full_name'
  END as user_full_name_status,
  CASE 
    WHEN i.identity_data ? 'sub' THEN '✅ identity has sub'
    ELSE '❌ identity missing sub'
  END as identity_sub_status,
  CASE 
    WHEN i.identity_data ? 'email' THEN '✅ identity has email'
    ELSE '❌ identity missing email'
  END as identity_email_status,
  CASE 
    WHEN i.identity_data ? 'email_verified' THEN '✅ identity has email_verified'
    ELSE '❌ identity missing email_verified'
  END as identity_verified_status,
  CASE 
    WHEN i.identity_data ? 'provider' THEN '✅ identity has provider'
    ELSE '❌ identity missing provider'
  END as identity_provider_status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 7: Check for constraint violations
SELECT '=== CONSTRAINT CHECK ===' as step;

-- Check if there are any constraint violations
SELECT 
  'Constraint Check' as check_type,
  'Checking for duplicate emails...' as message;

SELECT 
  email,
  COUNT(*) as count
FROM auth.users 
WHERE email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
GROUP BY email
HAVING COUNT(*) > 1;

-- Check for duplicate identities
SELECT 
  'Duplicate Identities' as check_type,
  provider_id,
  COUNT(*) as count
FROM auth.identities 
WHERE provider_id IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
GROUP BY provider_id
HAVING COUNT(*) > 1;

-- Step 8: Check auth schema permissions
SELECT '=== SCHEMA PERMISSIONS CHECK ===' as step;

SELECT 
  'Schema Permissions' as check_type,
  schemaname,
  tablename,
  has_table_privilege('auth', tablename, 'SELECT') as can_select,
  has_table_privilege('auth', tablename, 'INSERT') as can_insert,
  has_table_privilege('auth', tablename, 'UPDATE') as can_update,
  has_table_privilege('auth', tablename, 'DELETE') as can_delete
FROM pg_tables 
WHERE schemaname = 'auth' 
  AND tablename IN ('users', 'identities')
ORDER BY tablename;

-- Final summary
SELECT '=== INVESTIGATION COMPLETE ===' as step;
SELECT 'Review all results above to identify the root cause' as message;
