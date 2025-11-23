-- ============================================
-- DUPLICATE ALL DATA TO ALL USERS
-- This script duplicates all existing data to all users
-- so everyone can see everything
-- WARNING: This will create a lot of duplicate records
-- ============================================

-- ============================================
-- STEP 1: PRE-FLIGHT CHECKS
-- ============================================

SELECT '=== STEP 1: PRE-FLIGHT CHECKS ===' as step;

-- Count current data
SELECT 
  'Current Data Counts' as check_type,
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM public.models) as total_models,
  (SELECT COUNT(*) FROM public.model_rows) as total_rows,
  (SELECT COUNT(*) FROM public.jobs) as total_jobs,
  (SELECT COUNT(*) FROM public.generated_images) as total_images;

-- Estimate new counts (approximate)
SELECT 
  'Estimated New Counts' as check_type,
  (SELECT COUNT(*) FROM auth.users) * (SELECT COUNT(*) FROM public.models) as estimated_models,
  (SELECT COUNT(*) FROM auth.users) * (SELECT COUNT(*) FROM public.model_rows) as estimated_rows,
  (SELECT COUNT(*) FROM auth.users) * (SELECT COUNT(*) FROM public.jobs) as estimated_jobs,
  (SELECT COUNT(*) FROM auth.users) * (SELECT COUNT(*) FROM public.generated_images) as estimated_images;

-- ============================================
-- STEP 2: CREATE HELPER FUNCTIONS FIRST
-- ============================================

-- Create helper functions before using them

-- Helper Function: Duplicate images (must be created first as it's called by others)
CREATE OR REPLACE FUNCTION duplicate_images_for_job(
  p_original_job_id uuid,
  p_new_job_id uuid,
  p_new_row_id uuid,
  p_new_model_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  image_rec RECORD;
BEGIN
  FOR image_rec IN 
    SELECT * FROM public.generated_images 
    WHERE job_id = p_original_job_id
  LOOP
    INSERT INTO public.generated_images (
      id, job_id, row_id, model_id, team_id, user_id,
      output_url, width, height, created_at
    )
    VALUES (
      gen_random_uuid(),
      p_new_job_id,
      p_new_row_id,
      p_new_model_id,
      NULL, -- Set team_id to NULL
      p_user_id,
      image_rec.output_url, -- Keep the same URL/path
      image_rec.width,
      image_rec.height,
      image_rec.created_at
    );
  END LOOP;
END;
$$;

-- Helper Function: Duplicate jobs (calls duplicate_images_for_job)
CREATE OR REPLACE FUNCTION duplicate_jobs_for_row(
  p_original_row_id uuid,
  p_new_row_id uuid,
  p_new_model_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  job_rec RECORD;
  new_job_id uuid;
BEGIN
  FOR job_rec IN 
    SELECT * FROM public.jobs 
    WHERE row_id = p_original_row_id
  LOOP
    INSERT INTO public.jobs (
      id, row_id, model_id, team_id, user_id,
      request_payload, provider_request_id, status, error,
      created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_new_row_id,
      p_new_model_id,
      NULL, -- Set team_id to NULL
      p_user_id,
      job_rec.request_payload,
      job_rec.provider_request_id,
      job_rec.status,
      job_rec.error,
      job_rec.created_at,
      job_rec.updated_at
    )
    RETURNING id INTO new_job_id;
    
    -- Duplicate images for this job
    PERFORM duplicate_images_for_job(job_rec.id, new_job_id, p_new_row_id, p_new_model_id, p_user_id);
  END LOOP;
END;
$$;

-- Helper Function: Duplicate model rows (calls duplicate_jobs_for_row)
CREATE OR REPLACE FUNCTION duplicate_model_rows_for_user(
  p_original_model_id uuid,
  p_new_model_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  row_rec RECORD;
  new_row_id uuid;
BEGIN
  FOR row_rec IN 
    SELECT * FROM public.model_rows 
    WHERE model_id = p_original_model_id
  LOOP
    INSERT INTO public.model_rows (
      id, model_id, ref_image_urls, target_image_url,
      prompt_override, status, created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      p_new_model_id,
      row_rec.ref_image_urls,
      row_rec.target_image_url,
      row_rec.prompt_override,
      row_rec.status,
      p_user_id,
      row_rec.created_at
    )
    RETURNING id INTO new_row_id;
    
    -- Duplicate jobs for this row
    PERFORM duplicate_jobs_for_row(row_rec.id, new_row_id, p_new_model_id, p_user_id);
  END LOOP;
END;
$$;

-- ============================================
-- STEP 3: DUPLICATE MODELS TO ALL USERS
-- ============================================

SELECT '=== STEP 3: DUPLICATING MODELS ===' as step;

DO $$
DECLARE
  user_rec RECORD;
  model_rec RECORD;
  new_model_id uuid;
  models_created int := 0;
BEGIN
  FOR user_rec IN SELECT id, email FROM auth.users
  LOOP
    RAISE NOTICE 'Processing user: % (%)', user_rec.email, user_rec.id;
    
    FOR model_rec IN SELECT * FROM public.models
    LOOP
      -- Check if user already has a similar model (by name and prompt)
      -- If not, create a duplicate
      IF NOT EXISTS (
        SELECT 1 FROM public.models 
        WHERE owner_id = user_rec.id 
        AND name = model_rec.name
        AND default_prompt = model_rec.default_prompt
        AND COALESCE(default_ref_headshot_url, '') = COALESCE(model_rec.default_ref_headshot_url, '')
      ) THEN
        INSERT INTO public.models (
          id, team_id, owner_id, name, default_prompt, 
          default_ref_headshot_url, size, requests_default, created_at
        )
        VALUES (
          gen_random_uuid(),
          NULL, -- Set team_id to NULL for personal models
          user_rec.id,
          model_rec.name,
          model_rec.default_prompt,
          model_rec.default_ref_headshot_url,
          model_rec.size,
          model_rec.requests_default,
          model_rec.created_at
        )
        RETURNING id INTO new_model_id;
        
        models_created := models_created + 1;
        
        -- Duplicate all rows for this model
        PERFORM duplicate_model_rows_for_user(model_rec.id, new_model_id, user_rec.id);
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '✓ Created % model duplicates', models_created;
END $$;

-- ============================================
-- STEP 4: VERIFICATION
-- ============================================

SELECT '=== STEP 3: VERIFICATION ===' as step;

-- Show data per user
SELECT 
  'Data Per User After Duplication' as check_type,
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images
FROM auth.users u
ORDER BY u.email;

-- Final counts
SELECT 
  'Final Data Counts' as check_type,
  (SELECT COUNT(*) FROM public.models) as total_models,
  (SELECT COUNT(*) FROM public.model_rows) as total_rows,
  (SELECT COUNT(*) FROM public.jobs) as total_jobs,
  (SELECT COUNT(*) FROM public.generated_images) as total_images;

SELECT 
  'Duplication Complete' as status,
  'All data has been duplicated to all users' as message,
  'Each user should now see all models, rows, jobs, and images' as note;

