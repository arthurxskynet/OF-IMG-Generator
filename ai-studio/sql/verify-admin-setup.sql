-- Verification script for admin setup
-- Run this to verify everything is configured correctly

-- ============================================
-- 1. Check if admin user exists
-- ============================================
SELECT 
  'Admin User Check' as check_type,
  u.id as user_id,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.is_admin,
  p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE u.email = 'arthurmarshall@cosa-ai.co.uk';

-- ============================================
-- 2. Verify is_admin column exists
-- ============================================
SELECT 
  'Column Check' as check_type,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_admin';

-- ============================================
-- 3. Verify is_admin_user() function exists
-- ============================================
SELECT 
  'Function Check' as check_type,
  routine_name,
  routine_type,
  routine_schema
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_admin_user';

-- ============================================
-- 4. Verify get_user_id_from_storage_path() function exists
-- ============================================
SELECT 
  'Storage Function Check' as check_type,
  routine_name,
  routine_type,
  routine_schema
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_user_id_from_storage_path';

-- ============================================
-- 5. Check RLS policies on main tables
-- ============================================
SELECT 
  'RLS Policies Check' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'teams', 'models', 'model_rows', 'jobs', 'generated_images', 'variant_rows', 'variant_row_images')
  AND policyname LIKE '%admin%'
ORDER BY tablename, policyname;

-- ============================================
-- 6. Check storage policies
-- ============================================
SELECT 
  'Storage Policies Check' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE '%admin%' OR policyname LIKE '%user%')
ORDER BY policyname;

-- ============================================
-- 7. Test is_admin_user() function (if admin user exists)
-- ============================================
DO $$
DECLARE
  admin_user_id uuid;
  test_result boolean;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'arthurmarshall@cosa-ai.co.uk';
  
  IF admin_user_id IS NOT NULL THEN
    -- Set the auth context (this is a simulation, actual auth.uid() will be set by Supabase)
    RAISE NOTICE 'Admin user found with ID: %', admin_user_id;
    RAISE NOTICE 'Note: is_admin_user() function requires actual auth context to test';
  ELSE
    RAISE NOTICE 'Admin user not found - run create-admin-user.sql first';
  END IF;
END $$;

-- ============================================
-- 8. Summary
-- ============================================
SELECT 
  'Summary' as check_type,
  (SELECT COUNT(*) FROM auth.users WHERE email = 'arthurmarshall@cosa-ai.co.uk') as admin_user_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_admin') as is_admin_column_exists,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'is_admin_user') as is_admin_function_exists,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_user_id_from_storage_path') as storage_function_exists,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE '%admin%') as table_policies_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND (policyname LIKE '%admin%' OR policyname LIKE '%user%')) as storage_policies_count;

