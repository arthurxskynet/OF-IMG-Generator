-- ============================================
-- QUICK FIX FOR DATA VISIBILITY ISSUES
-- Run this first to quickly fix common issues
-- ============================================

-- Step 1: Ensure all users with data have profiles
-- This is the most common issue - RLS policies require profiles
INSERT INTO public.profiles (user_id, full_name, created_at)
SELECT 
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name', 
    SPLIT_PART(u.email, '@', 1),
    'User'
  ),
  COALESCE(u.created_at, now())
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
)
AND (
  EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
  OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id)
  OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = u.id)
  OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = u.id)
)
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Verify profiles were created
SELECT 
  'Profile Creation Result' as check_type,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)) as users_with_profiles,
  COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)) as users_without_profiles,
  COUNT(*) as total_users_with_data
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
   OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id)
   OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = u.id);

-- Step 3: Show data summary for verification
SELECT 
  'Data Visibility Check' as check_type,
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images,
  CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u.id) 
    THEN '✓ Ready' 
    ELSE '❌ Missing Profile' 
  END as status
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
   OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id)
   OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = u.id)
ORDER BY u.email;

-- Step 4: Check for orphaned data (data with user_ids that don't exist)
SELECT 
  'Orphaned Data Check' as check_type,
  (SELECT COUNT(*) FROM public.models WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)) as orphaned_models,
  (SELECT COUNT(*) FROM public.model_rows WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by)) as orphaned_rows,
  (SELECT COUNT(*) FROM public.jobs WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_images;

-- If orphaned data exists, you'll need to run MIGRATE_OLD_DATA.sql and REASSIGN_ORPHANED_DATA.sql

SELECT 
  'Quick Fix Complete' as status,
  'All users with data should now have profiles' as message,
  'If data is still not visible, check that you are logged in as the correct user' as note;

