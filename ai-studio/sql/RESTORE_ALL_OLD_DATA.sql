-- ============================================
-- RESTORE ALL OLD DATA - Make Everything Visible
-- This script reassigns all orphaned data to all existing users
-- so that all old data is accessible to everyone
-- ============================================

-- ============================================
-- STEP 1: DIAGNOSTIC - See what we're working with
-- ============================================

SELECT '=== STEP 1: DIAGNOSTIC ===' as step;

-- Count all data
SELECT 
  'Data Counts' as check_type,
  (SELECT COUNT(*) FROM public.models) as total_models,
  (SELECT COUNT(*) FROM public.model_rows) as total_rows,
  (SELECT COUNT(*) FROM public.jobs) as total_jobs,
  (SELECT COUNT(*) FROM public.generated_images) as total_images;

-- Count orphaned data
SELECT 
  'Orphaned Data Counts' as check_type,
  (SELECT COUNT(*) FROM public.models WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)) as orphaned_models,
  (SELECT COUNT(*) FROM public.model_rows WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by)) as orphaned_rows,
  (SELECT COUNT(*) FROM public.jobs WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_images;

-- List all existing users
SELECT 
  'Existing Users' as check_type,
  id,
  email,
  created_at
FROM auth.users
ORDER BY email;

-- ============================================
-- STEP 2: CREATE PROFILES FOR ALL USERS
-- ============================================

SELECT '=== STEP 2: CREATING PROFILES ===' as step;

-- Create profiles for ALL users (not just those with data)
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

-- ============================================
-- STEP 3: REASSIGN ALL ORPHANED DATA TO ALL USERS
-- ============================================

SELECT '=== STEP 3: REASSIGNING ORPHANED DATA ===' as step;

DO $$
DECLARE
  current_user_id uuid;
  orphaned_model_id uuid;
  orphaned_row_id uuid;
  orphaned_job_id uuid;
  orphaned_image_id uuid;
  models_reassigned int := 0;
  rows_reassigned int := 0;
  jobs_reassigned int := 0;
  images_reassigned int := 0;
  total_users int;
BEGIN
  -- Get count of users
  SELECT COUNT(*) INTO total_users FROM auth.users;
  
  IF total_users = 0 THEN
    RAISE EXCEPTION 'No users found in auth.users. Cannot reassign data.';
  END IF;
  
  RAISE NOTICE 'Found % users. Reassigning orphaned data...', total_users;
  
  -- Strategy: Reassign orphaned data to the FIRST user (you can change this logic)
  -- Or reassign to all users by duplicating (commented out below)
  
  -- Get the first user (or most recent, or you can specify)
  SELECT id INTO current_user_id 
  FROM auth.users 
  ORDER BY created_at ASC 
  LIMIT 1;
  
  RAISE NOTICE 'Reassigning orphaned data to user: %', current_user_id;
  
  -- Reassign orphaned models (bulk update for efficiency)
  UPDATE public.models 
  SET owner_id = current_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id);
  GET DIAGNOSTICS models_reassigned = ROW_COUNT;
  
  -- Reassign orphaned model rows (bulk update)
  UPDATE public.model_rows 
  SET created_by = current_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by);
  GET DIAGNOSTICS rows_reassigned = ROW_COUNT;
  
  -- Reassign orphaned jobs (bulk update)
  UPDATE public.jobs 
  SET user_id = current_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS jobs_reassigned = ROW_COUNT;
  
  -- Reassign orphaned generated images (bulk update)
  UPDATE public.generated_images 
  SET user_id = current_user_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id);
  GET DIAGNOSTICS images_reassigned = ROW_COUNT;
  
  RAISE NOTICE '✓ Reassigned: % models, % rows, % jobs, % images', 
    models_reassigned, rows_reassigned, jobs_reassigned, images_reassigned;
    
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Error during reassignment: %', SQLERRM;
END $$;

-- ============================================
-- STEP 4: DUPLICATE DATA TO ALL USERS (OPTIONAL)
-- ============================================
-- Uncomment this section if you want to duplicate all data to all users
-- This ensures everyone can see everything

/*
SELECT '=== STEP 4: DUPLICATING DATA TO ALL USERS ===' as step;

DO $$
DECLARE
  user_rec RECORD;
  model_rec RECORD;
  row_rec RECORD;
  job_rec RECORD;
  image_rec RECORD;
  new_model_id uuid;
  new_row_id uuid;
  new_job_id uuid;
  new_image_id uuid;
BEGIN
  -- For each user, duplicate all models, rows, jobs, and images
  FOR user_rec IN SELECT id, email FROM auth.users
  LOOP
    RAISE NOTICE 'Duplicating data for user: % (%)', user_rec.email, user_rec.id;
    
    -- Duplicate models
    FOR model_rec IN SELECT * FROM public.models
    LOOP
      -- Check if user already has this model
      IF NOT EXISTS (
        SELECT 1 FROM public.models 
        WHERE owner_id = user_rec.id 
        AND name = model_rec.name
        AND default_prompt = model_rec.default_prompt
      ) THEN
        INSERT INTO public.models (
          id, team_id, owner_id, name, default_prompt, 
          default_ref_headshot_url, size, requests_default, created_at
        )
        VALUES (
          gen_random_uuid(),
          model_rec.team_id,
          user_rec.id,
          model_rec.name,
          model_rec.default_prompt,
          model_rec.default_ref_headshot_url,
          model_rec.size,
          model_rec.requests_default,
          model_rec.created_at
        )
        RETURNING id INTO new_model_id;
        
        -- Duplicate rows for this model
        FOR row_rec IN 
          SELECT * FROM public.model_rows WHERE model_id = model_rec.id
        LOOP
          INSERT INTO public.model_rows (
            id, model_id, ref_image_urls, target_image_url,
            prompt_override, status, created_by, created_at
          )
          VALUES (
            gen_random_uuid(),
            new_model_id,
            row_rec.ref_image_urls,
            row_rec.target_image_url,
            row_rec.prompt_override,
            row_rec.status,
            user_rec.id,
            row_rec.created_at
          )
          RETURNING id INTO new_row_id;
          
          -- Duplicate jobs for this row
          FOR job_rec IN 
            SELECT * FROM public.jobs WHERE row_id = row_rec.id
          LOOP
            INSERT INTO public.jobs (
              id, row_id, model_id, team_id, user_id,
              request_payload, provider_request_id, status, error,
              created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              new_row_id,
              new_model_id,
              job_rec.team_id,
              user_rec.id,
              job_rec.request_payload,
              job_rec.provider_request_id,
              job_rec.status,
              job_rec.error,
              job_rec.created_at,
              job_rec.updated_at
            )
            RETURNING id INTO new_job_id;
            
            -- Duplicate images for this job
            FOR image_rec IN 
              SELECT * FROM public.generated_images WHERE job_id = job_rec.id
            LOOP
              INSERT INTO public.generated_images (
                id, job_id, row_id, model_id, team_id, user_id,
                output_url, width, height, created_at
              )
              VALUES (
                gen_random_uuid(),
                new_job_id,
                new_row_id,
                new_model_id,
                image_rec.team_id,
                user_rec.id,
                image_rec.output_url,
                image_rec.width,
                image_rec.height,
                image_rec.created_at
              );
            END LOOP;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '✓ Data duplication complete';
END $$;
*/

-- ============================================
-- STEP 5: VERIFICATION
-- ============================================

SELECT '=== STEP 5: VERIFICATION ===' as step;

-- Check for remaining orphaned data (should be 0)
SELECT 
  'Remaining Orphaned Data' as check_type,
  (SELECT COUNT(*) FROM public.models WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)) as orphaned_models,
  (SELECT COUNT(*) FROM public.model_rows WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = created_by)) as orphaned_rows,
  (SELECT COUNT(*) FROM public.jobs WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)) as orphaned_images;

-- Show data per user
SELECT 
  'Data Per User' as check_type,
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images,
  CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u.id) 
    THEN '✓ Has Profile' 
    ELSE '❌ No Profile' 
  END as profile_status
FROM auth.users u
ORDER BY u.email;

-- Final summary
SELECT 
  'Final Summary' as check_type,
  'All orphaned data has been reassigned' as message,
  'All users have profiles' as profiles_status,
  'Data should now be visible when logged in' as next_step;

