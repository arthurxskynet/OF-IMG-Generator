-- ============================================
-- FIX ALL DATA VISIBILITY - ONE STEP SOLUTION
-- This script ensures all old data is visible to all users
-- Run this to restore all your data
-- ============================================

-- Step 1: Create profiles for ALL users
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
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Reassign all orphaned data to the first user
-- (Change this logic if you want to assign to a specific user)
DO $$
DECLARE
  target_user_id uuid;
  models_fixed int;
  rows_fixed int;
  jobs_fixed int;
  images_fixed int;
BEGIN
  -- Get the first user (or change this to a specific user email)
  SELECT id INTO target_user_id 
  FROM auth.users 
  ORDER BY created_at ASC 
  LIMIT 1;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users';
  END IF;
  
  RAISE NOTICE 'Reassigning orphaned data to user: %', target_user_id;
  
  -- Fix orphaned models
  UPDATE public.models 
  SET owner_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id);
  GET DIAGNOSTICS models_fixed = ROW_COUNT;
  
  -- Fix orphaned model rows
  UPDATE public.model_rows 
  SET created_by = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by);
  GET DIAGNOSTICS rows_fixed = ROW_COUNT;
  
  -- Fix orphaned jobs
  UPDATE public.jobs 
  SET user_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS jobs_fixed = ROW_COUNT;
  
  -- Fix orphaned generated images
  UPDATE public.generated_images 
  SET user_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS images_fixed = ROW_COUNT;
  
  RAISE NOTICE '✓ Fixed: % models, % rows, % jobs, % images', 
    models_fixed, rows_fixed, jobs_fixed, images_fixed;
END $$;

-- Step 3: Show results
SELECT 
  'Data Visibility Status' as check_type,
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images,
  CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u.id) 
    THEN '✓ Ready' 
    ELSE '❌ No Profile' 
  END as status
FROM auth.users u
ORDER BY u.email;

-- Step 4: Verify no orphaned data remains
SELECT 
  'Orphaned Data Check' as check_type,
  (SELECT COUNT(*) FROM public.models WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)) as orphaned_models,
  (SELECT COUNT(*) FROM public.model_rows WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by)) as orphaned_rows,
  (SELECT COUNT(*) FROM public.jobs WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_images;

SELECT 
  'Fix Complete' as status,
  'All data should now be visible' as message,
  'Log in and check your profile' as next_step;

