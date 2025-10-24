-- Check if users actually exist in the database
-- Run this in Supabase SQL Editor

-- Step 1: Check if users exist in auth.users
SELECT '=== USER EXISTENCE CHECK ===' as step;

SELECT 
  'Users in auth.users' as check_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN email = 'passarthur2003@icloud.com' THEN 1 END) as working_user_count,
  COUNT(CASE WHEN email = '15nicholls444@gmail.com' THEN 1 END) as nicholls_user_count,
  COUNT(CASE WHEN email = 'Neickomarsh02@gmail.com' THEN 1 END) as neicko_user_count
FROM auth.users;

-- Step 2: Check if identities exist
SELECT '=== IDENTITY EXISTENCE CHECK ===' as step;

SELECT 
  'Identities in auth.identities' as check_type,
  COUNT(*) as total_identities,
  COUNT(CASE WHEN provider_id = 'passarthur2003@icloud.com' THEN 1 END) as working_identity_count,
  COUNT(CASE WHEN provider_id = '15nicholls444@gmail.com' THEN 1 END) as nicholls_identity_count,
  COUNT(CASE WHEN provider_id = 'Neickomarsh02@gmail.com' THEN 1 END) as neicko_identity_count
FROM auth.identities;

-- Step 3: Check if profiles exist
SELECT '=== PROFILE EXISTENCE CHECK ===' as step;

SELECT 
  'Profiles in public.profiles' as check_type,
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN u.email = 'passarthur2003@icloud.com' THEN 1 END) as working_profile_count,
  COUNT(CASE WHEN u.email = '15nicholls444@gmail.com' THEN 1 END) as nicholls_profile_count,
  COUNT(CASE WHEN u.email = 'Neickomarsh02@gmail.com' THEN 1 END) as neicko_profile_count
FROM public.profiles p
JOIN auth.users u ON p.user_id = u.id;

-- Step 4: Get detailed user records if they exist
SELECT '=== DETAILED USER RECORDS ===' as step;

SELECT 
  'Detailed User Records' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at,
  u.updated_at,
  u.raw_app_meta_data,
  u.raw_user_meta_data
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Step 5: Get detailed identity records if they exist
SELECT '=== DETAILED IDENTITY RECORDS ===' as step;

SELECT 
  'Detailed Identity Records' as check_type,
  i.id,
  i.provider,
  i.provider_id,
  i.user_id,
  i.identity_data,
  i.created_at,
  i.updated_at
FROM auth.identities i
WHERE i.provider_id IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY i.provider_id;

-- Step 6: Check for any database errors or constraints
SELECT '=== CONSTRAINT AND ERROR CHECK ===' as step;

-- Check for any foreign key violations
SELECT 
  'Foreign Key Check' as check_type,
  'Checking for orphaned identities...' as message;

SELECT 
  'Orphaned Identities' as issue,
  i.id,
  i.provider_id,
  i.user_id
FROM auth.identities i
LEFT JOIN auth.users u ON i.user_id = u.id
WHERE u.id IS NULL
  AND i.provider_id IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');

-- Check for any orphaned profiles
SELECT 
  'Orphaned Profiles' as issue,
  p.user_id,
  p.full_name
FROM public.profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- Step 7: Check database permissions
SELECT '=== PERMISSION CHECK ===' as step;

SELECT 
  'Current User Permissions' as check_type,
  current_user as current_user,
  session_user as session_user,
  current_database() as current_database,
  current_schema() as current_schema;

-- Check if we can access auth schema
SELECT 
  'Auth Schema Access' as check_type,
  has_schema_privilege('auth', 'USAGE') as can_use_auth_schema,
  has_schema_privilege('auth', 'CREATE') as can_create_in_auth;

-- Final summary
SELECT '=== SUMMARY ===' as step;
SELECT 
  'If any counts are 0, the users were not created properly' as message,
  'Check the detailed records above for any issues' as next_step;
