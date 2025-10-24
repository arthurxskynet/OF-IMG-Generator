-- Diagnostic script to identify authentication issues
-- Run this in Supabase SQL Editor

-- 1. Check all users and their structure
SELECT 
  'All Users' as check_type,
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

-- 2. Check all identities
SELECT 
  'All Identities' as check_type,
  i.id,
  i.provider,
  i.provider_id,
  i.user_id,
  i.identity_data,
  i.created_at
FROM auth.identities i
ORDER BY i.created_at;

-- 3. Check for missing identities
SELECT 
  'Missing Identities' as check_type,
  u.id,
  u.email,
  'No identity record' as issue
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE i.id IS NULL;

-- 4. Check for inconsistent data
SELECT 
  'Data Inconsistencies' as check_type,
  u.email,
  CASE 
    WHEN u.email_confirmed_at IS NULL THEN 'email_confirmed_at is NULL'
    WHEN u.instance_id IS NULL THEN 'instance_id is NULL'
    WHEN u.aud IS NULL THEN 'aud is NULL'
    WHEN u.role IS NULL THEN 'role is NULL'
    WHEN u.raw_app_meta_data IS NULL THEN 'raw_app_meta_data is NULL'
    WHEN u.raw_user_meta_data IS NULL THEN 'raw_user_meta_data is NULL'
    WHEN i.identity_data->'email_verified' IS NULL THEN 'email_verified in identity is NULL'
    WHEN i.identity_data->'sub' IS NULL THEN 'sub in identity is NULL'
    ELSE 'No obvious issues'
  END as issue
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com', 'passarthur2003@icloud.com');

-- 5. Check extensions
SELECT 
  'Extensions' as check_type,
  extname as extension_name,
  extversion as version
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt')
ORDER BY extname;
