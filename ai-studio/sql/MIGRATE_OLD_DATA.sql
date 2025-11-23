-- ============================================
-- MIGRATE OLD DATA TO ENSURE VISIBILITY
-- This script ensures all old data is accessible after schema fixes
-- ============================================

-- ============================================
-- STEP 1: DIAGNOSTIC - Check current state
-- ============================================

SELECT '=== STEP 1: DIAGNOSTIC ===' as step;

-- Check for orphaned data (user_ids that don't exist in auth.users)
SELECT 
  'Orphaned Models' as check_type,
  COUNT(*) as count,
  'Models with user_ids not in auth.users' as description
FROM public.models m
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = m.owner_id
);

SELECT 
  'Orphaned Model Rows' as check_type,
  COUNT(*) as count,
  'Rows with user_ids not in auth.users' as description
FROM public.model_rows mr
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = mr.created_by
);

SELECT 
  'Orphaned Jobs' as check_type,
  COUNT(*) as count,
  'Jobs with user_ids not in auth.users' as description
FROM public.jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = j.user_id
);

SELECT 
  'Orphaned Generated Images' as check_type,
  COUNT(*) as count,
  'Images with user_ids not in auth.users' as description
FROM public.generated_images gi
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = gi.user_id
);

-- Check for missing profiles
SELECT 
  'Missing Profiles' as check_type,
  COUNT(DISTINCT u.id) as count,
  'Users with data but no profile' as description
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
)
AND (
  EXISTS (SELECT 1 FROM public.models m WHERE m.owner_id = u.id)
  OR EXISTS (SELECT 1 FROM public.model_rows mr WHERE mr.created_by = u.id)
  OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.user_id = u.id)
  OR EXISTS (SELECT 1 FROM public.generated_images gi WHERE gi.user_id = u.id)
);

-- Show data counts per user
SELECT 
  'Data Summary' as check_type,
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models_count,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows_count,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs_count,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images_count,
  CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u.id) 
    THEN '✓ Has Profile' 
    ELSE '❌ No Profile' 
  END as profile_status
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
   OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id)
   OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = u.id)
ORDER BY u.email;

-- ============================================
-- STEP 2: CREATE MISSING PROFILES
-- ============================================

SELECT '=== STEP 2: CREATING MISSING PROFILES ===' as step;

-- Create profiles for all users who have data but no profile
INSERT INTO public.profiles (user_id, full_name, created_at)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'User'),
  COALESCE(u.created_at, now())
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
)
AND (
  EXISTS (SELECT 1 FROM public.models m WHERE m.owner_id = u.id)
  OR EXISTS (SELECT 1 FROM public.model_rows mr WHERE mr.created_by = u.id)
  OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.user_id = u.id)
  OR EXISTS (SELECT 1 FROM public.generated_images gi WHERE gi.user_id = u.id)
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- STEP 3: FIX ORPHANED DATA (Manual mapping required)
-- ============================================

SELECT '=== STEP 3: FIXING ORPHANED DATA ===' as step;

-- Show all orphaned data that needs manual attention
-- Orphaned Models
SELECT 
  'Orphaned Models' as check_type,
  m.id as model_id,
  m.name as model_name,
  m.owner_id as orphaned_user_id,
  m.created_at,
  'Needs manual reassignment' as action_required
FROM public.models m
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = m.owner_id
);

-- Orphaned Model Rows
SELECT 
  'Orphaned Model Rows' as check_type,
  mr.id as row_id,
  mr.model_id,
  mr.created_by as orphaned_user_id,
  mr.created_at,
  'Needs manual reassignment' as action_required
FROM public.model_rows mr
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = mr.created_by
)
LIMIT 20;

-- Orphaned Jobs
SELECT 
  'Orphaned Jobs' as check_type,
  j.id as job_id,
  j.user_id as orphaned_user_id,
  j.model_id,
  j.status,
  j.created_at,
  'Needs manual reassignment' as action_required
FROM public.jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = j.user_id
)
LIMIT 20;

-- Orphaned Generated Images
SELECT 
  'Orphaned Generated Images' as check_type,
  gi.id as image_id,
  gi.user_id as orphaned_user_id,
  gi.model_id,
  gi.output_url,
  gi.created_at,
  'Needs manual reassignment' as action_required
FROM public.generated_images gi
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = gi.user_id
)
LIMIT 20;

-- Note: If you need to reassign orphaned data, you'll need to:
-- 1. Identify which existing user should own the data
-- 2. Update the foreign keys manually
-- Example: UPDATE public.models SET owner_id = '<new_user_id>' WHERE id = '<model_id>';

-- ============================================
-- STEP 4: VERIFY DATA ACCESSIBILITY
-- ============================================

SELECT '=== STEP 4: VERIFYING DATA ACCESSIBILITY ===' as step;

-- Check if RLS policies would allow access
-- This simulates what each user would see
DO $$
DECLARE
  user_rec RECORD;
  models_count int;
  rows_count int;
  jobs_count int;
  images_count int;
BEGIN
  FOR user_rec IN 
    SELECT id, email FROM auth.users 
    WHERE EXISTS (SELECT 1 FROM public.models WHERE owner_id = auth.users.id)
       OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = auth.users.id)
       OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = auth.users.id)
       OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = auth.users.id)
    LIMIT 5
  LOOP
    -- Note: We can't actually test RLS with auth.uid() in a script
    -- But we can verify the data exists and profiles are created
    SELECT COUNT(*) INTO models_count 
    FROM public.models 
    WHERE owner_id = user_rec.id;
    
    SELECT COUNT(*) INTO rows_count 
    FROM public.model_rows 
    WHERE created_by = user_rec.id;
    
    SELECT COUNT(*) INTO jobs_count 
    FROM public.jobs 
    WHERE user_id = user_rec.id;
    
    SELECT COUNT(*) INTO images_count 
    FROM public.generated_images 
    WHERE user_id = user_rec.id;
    
    RAISE NOTICE 'User: % (%) - Models: %, Rows: %, Jobs: %, Images: %', 
      user_rec.email, user_rec.id, models_count, rows_count, jobs_count, images_count;
  END LOOP;
END $$;

-- ============================================
-- STEP 5: FINAL VERIFICATION
-- ============================================

SELECT '=== STEP 5: FINAL VERIFICATION ===' as step;

-- Verify all users with data have profiles
SELECT 
  'Profile Coverage' as check_type,
  COUNT(DISTINCT u.id) FILTER (WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)) as users_with_profiles,
  COUNT(DISTINCT u.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)) as users_without_profiles,
  COUNT(DISTINCT u.id) as total_users_with_data
FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
   OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id)
   OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.generated_images WHERE user_id = u.id);

-- Summary of all data
SELECT 
  'Data Summary' as check_type,
  (SELECT COUNT(*) FROM public.models) as total_models,
  (SELECT COUNT(*) FROM public.model_rows) as total_rows,
  (SELECT COUNT(*) FROM public.jobs) as total_jobs,
  (SELECT COUNT(*) FROM public.generated_images) as total_images,
  (SELECT COUNT(DISTINCT owner_id) FROM public.models) as unique_model_owners,
  (SELECT COUNT(DISTINCT created_by) FROM public.model_rows) as unique_row_creators,
  (SELECT COUNT(DISTINCT user_id) FROM public.jobs) as unique_job_users,
  (SELECT COUNT(DISTINCT user_id) FROM public.generated_images) as unique_image_users;

-- ============================================
-- STEP 6: RECOMMENDATIONS
-- ============================================

SELECT '=== STEP 6: RECOMMENDATIONS ===' as step;

SELECT 
  'Next Steps' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.models m 
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.owner_id)
    ) THEN '⚠️ You have orphaned models. You may need to manually reassign them to existing users.'
    ELSE '✓ No orphaned models found'
  END as models_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
      AND (EXISTS (SELECT 1 FROM public.models WHERE owner_id = u.id)
        OR EXISTS (SELECT 1 FROM public.model_rows WHERE created_by = u.id))
    ) THEN '⚠️ Some users still missing profiles. Run Step 2 again.'
    ELSE '✓ All users with data have profiles'
  END as profiles_status;

SELECT 
  'Final Status' as check_type,
  'Migration complete' as message,
  'All users with data should now have profiles' as note,
  'If data is still not visible, check that you are logged in as the correct user' as reminder;

