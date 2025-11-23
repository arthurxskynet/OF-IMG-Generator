-- ============================================
-- REASSIGN ALL DATA TO A SPECIFIC USER
-- Use this if you want to assign all orphaned data to your account
-- Replace 'YOUR_EMAIL@example.com' with your actual email
-- ============================================

-- ============================================
-- CONFIGURATION: Set your email here
-- ============================================

DO $$
DECLARE
  target_email text := 'passarthur2003@icloud.com'; -- CHANGE THIS TO YOUR EMAIL
  target_user_id uuid;
  models_reassigned int;
  rows_reassigned int;
  jobs_reassigned int;
  images_reassigned int;
BEGIN
  -- Find the target user
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found. Please check the email address.', target_email;
  END IF;
  
  RAISE NOTICE 'Found user: % (%)', target_email, target_user_id;
  RAISE NOTICE 'Reassigning all orphaned data...';
  
  -- Reassign all orphaned models
  UPDATE public.models 
  SET owner_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id);
  GET DIAGNOSTICS models_reassigned = ROW_COUNT;
  
  -- Reassign all orphaned model rows
  UPDATE public.model_rows 
  SET created_by = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by);
  GET DIAGNOSTICS rows_reassigned = ROW_COUNT;
  
  -- Reassign all orphaned jobs
  UPDATE public.jobs 
  SET user_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS jobs_reassigned = ROW_COUNT;
  
  -- Reassign all orphaned generated images
  UPDATE public.generated_images 
  SET user_id = target_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS images_reassigned = ROW_COUNT;
  
  -- Ensure profile exists
  INSERT INTO public.profiles (user_id, full_name, created_at)
  SELECT 
    target_user_id,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      SPLIT_PART(u.email, '@', 1),
      'User'
    ),
    COALESCE(u.created_at, now())
  FROM auth.users u
  WHERE u.id = target_user_id
  ON CONFLICT (user_id) DO NOTHING;
  
  RAISE NOTICE '✓ Reassigned: % models, % rows, % jobs, % images', 
    models_reassigned, rows_reassigned, jobs_reassigned, images_reassigned;
  
  -- Show final counts
  RAISE NOTICE 'Final data counts for %:', target_email;
  RAISE NOTICE '  Models: %', (SELECT COUNT(*) FROM public.models WHERE owner_id = target_user_id);
  RAISE NOTICE '  Rows: %', (SELECT COUNT(*) FROM public.model_rows WHERE created_by = target_user_id);
  RAISE NOTICE '  Jobs: %', (SELECT COUNT(*) FROM public.jobs WHERE user_id = target_user_id);
  RAISE NOTICE '  Images: %', (SELECT COUNT(*) FROM public.generated_images WHERE user_id = target_user_id);
END $$;

-- Show results
SELECT 
  'Reassignment Results' as check_type,
  u.email,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images
FROM auth.users u
WHERE u.email = 'passarthur2003@icloud.com'; -- CHANGE THIS TO YOUR EMAIL

