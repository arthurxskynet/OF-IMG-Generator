-- ============================================
-- RESTORE IMAGES FROM STORAGE BUCKETS
-- This script finds all images in storage and creates database records
-- for images that exist in storage but not in the database
-- ============================================

-- ============================================
-- STEP 1: FIND TARGET USER
-- ============================================

SELECT '=== STEP 1: FINDING TARGET USER ===' as step;

DO $$
DECLARE
  target_email text := 'passarthur2003@icloud.com';
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;
  
  RAISE NOTICE 'Found user: % (%)', target_email, target_user_id;
END $$;

-- ============================================
-- STEP 2: LIST ALL FILES IN STORAGE BUCKETS
-- ============================================

SELECT '=== STEP 2: LISTING FILES IN STORAGE ===' as step;

-- List all files in outputs bucket
SELECT 
  'Files in outputs bucket' as check_type,
  name as file_name,
  bucket_id,
  created_at,
  metadata->>'size' as file_size,
  metadata->>'mimetype' as mime_type
FROM storage.objects
WHERE bucket_id = 'outputs'
ORDER BY created_at DESC
LIMIT 100;

-- Count files per user (if path contains user ID)
SELECT 
  'Files by User Path' as check_type,
  CASE 
    WHEN name LIKE '%/%' THEN SPLIT_PART(name, '/', 1)
    ELSE 'unknown'
  END as user_path_prefix,
  COUNT(*) as file_count
FROM storage.objects
WHERE bucket_id = 'outputs'
GROUP BY user_path_prefix
ORDER BY file_count DESC;

-- ============================================
-- STEP 3: CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get or create a default model for a user
CREATE OR REPLACE FUNCTION get_or_create_default_model(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_model_id uuid;
BEGIN
  -- Try to get an existing model for this user
  SELECT id INTO v_model_id
  FROM public.models
  WHERE owner_id = p_user_id
  LIMIT 1;
  
  -- If no model exists, create a default one
  IF v_model_id IS NULL THEN
    INSERT INTO public.models (
      id, owner_id, name, default_prompt, size, requests_default, created_at
    )
    VALUES (
      gen_random_uuid(),
      p_user_id,
      'Restored Model',
      'Restored from storage',
      '2227*3183',
      6,
      now()
    )
    RETURNING id INTO v_model_id;
  END IF;
  
  RETURN v_model_id;
END;
$$;

-- Function to get or create a default row for a model
CREATE OR REPLACE FUNCTION get_or_create_default_row(p_model_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_row_id uuid;
BEGIN
  -- Try to get an existing row for this model
  SELECT id INTO v_row_id
  FROM public.model_rows
  WHERE model_id = p_model_id
  LIMIT 1;
  
  -- If no row exists, create a default one
  IF v_row_id IS NULL THEN
    INSERT INTO public.model_rows (
      id, model_id, target_image_url, status, created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      p_model_id,
      'restored',
      'idle',
      p_user_id,
      now()
    )
    RETURNING id INTO v_row_id;
  END IF;
  
  RETURN v_row_id;
END;
$$;

-- ============================================
-- STEP 4: RESTORE IMAGES FROM STORAGE
-- ============================================

SELECT '=== STEP 4: RESTORING IMAGES FROM STORAGE ===' as step;

DO $$
DECLARE
  target_email text := 'passarthur2003@icloud.com';
  v_target_user_id uuid;
  storage_file RECORD;
  v_image_url text;
  v_model_id uuid;
  v_row_id uuid;
  v_job_id uuid;
  v_image_id uuid;
  images_restored int := 0;
  images_skipped int := 0;
BEGIN
  -- Get target user
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE email = target_email;
  
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;
  
  -- Get or create default model
  v_model_id := get_or_create_default_model(v_target_user_id);
  RAISE NOTICE 'Using model: %', v_model_id;
  
  -- Get or create default row
  v_row_id := get_or_create_default_row(v_model_id, v_target_user_id);
  RAISE NOTICE 'Using row: %', v_row_id;
  
  -- Process all files in outputs bucket
  FOR storage_file IN 
    SELECT 
      name,
      bucket_id,
      created_at,
      metadata
    FROM storage.objects
    WHERE bucket_id = 'outputs'
    ORDER BY created_at DESC
  LOOP
    -- Construct the full URL path
    -- Format: outputs/{path} -> we'll use this as output_url
    v_image_url := 'outputs/' || storage_file.name;
    
    -- Check if this image already exists in the database
    IF EXISTS (
      SELECT 1 FROM public.generated_images 
      WHERE output_url = v_image_url OR output_url LIKE '%' || storage_file.name
    ) THEN
      images_skipped := images_skipped + 1;
      CONTINUE;
    END IF;
    
    -- Get or create a job for this image
    -- Try to find an existing job first
    SELECT j.id INTO v_job_id
    FROM public.jobs j
    WHERE j.row_id = v_row_id
      AND j.model_id = v_model_id
      AND j.user_id = v_target_user_id
      AND j.status = 'completed'
    LIMIT 1;
    
    -- If no job exists, create one
    IF v_job_id IS NULL THEN
      INSERT INTO public.jobs (
        id, row_id, model_id, user_id, request_payload, status, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        v_row_id,
        v_model_id,
        v_target_user_id,
        jsonb_build_object('restored', true, 'source', 'storage', 'image_url', v_image_url),
        'completed',
        COALESCE(storage_file.created_at, now()),
        COALESCE(storage_file.created_at, now())
      )
      RETURNING id INTO v_job_id;
    END IF;
    
    -- Create the generated_image record (v_job_id can be NULL, it's optional)
    INSERT INTO public.generated_images (
      id, job_id, row_id, model_id, user_id, output_url, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_job_id,
      v_row_id,
      v_model_id,
      v_target_user_id,
      v_image_url,
      COALESCE(storage_file.created_at, now())
    )
    ON CONFLICT DO NOTHING;
    
    IF FOUND THEN
      images_restored := images_restored + 1;
      IF images_restored % 100 = 0 THEN
        RAISE NOTICE 'Restored % images so far...', images_restored;
      END IF;
    ELSE
      images_skipped := images_skipped + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✓ Restored % images from storage', images_restored;
  RAISE NOTICE '✓ Skipped % images (already in database)', images_skipped;
END $$;

-- ============================================
-- STEP 5: RESTORE FROM OTHER BUCKETS (targets, refs)
-- ============================================

SELECT '=== STEP 5: RESTORING FROM OTHER BUCKETS ===' as step;

-- Note: targets and refs are typically used for input images
-- We'll create model_rows records for target images
DO $$
DECLARE
  target_email text := 'passarthur2003@icloud.com';
  v_target_user_id uuid;
  storage_file RECORD;
  v_model_id uuid;
  v_target_url text;
  rows_restored int := 0;
BEGIN
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE email = target_email;
  
  v_model_id := get_or_create_default_model(v_target_user_id);
  
  -- Process files in targets bucket
  FOR storage_file IN 
    SELECT name, created_at
    FROM storage.objects
    WHERE bucket_id = 'targets'
    ORDER BY created_at DESC
  LOOP
    v_target_url := 'targets/' || storage_file.name;
    
    -- Check if row with this target already exists
    IF EXISTS (
      SELECT 1 FROM public.model_rows 
      WHERE target_image_url = v_target_url
    ) THEN
      CONTINUE;
    END IF;
    
    -- Create a model_row for this target image
    INSERT INTO public.model_rows (
      id, model_id, target_image_url, status, created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_model_id,
      v_target_url,
      'idle',
      v_target_user_id,
      COALESCE(storage_file.created_at, now())
    )
    ON CONFLICT DO NOTHING;
    
    IF FOUND THEN
      rows_restored := rows_restored + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✓ Restored % target image rows', rows_restored;
END $$;

-- ============================================
-- STEP 6: VERIFICATION
-- ============================================

SELECT '=== STEP 6: VERIFICATION ===' as step;

-- Show restored data counts
SELECT 
  'Restored Data Summary' as check_type,
  u.email,
  (SELECT COUNT(*) FROM public.models WHERE owner_id = u.id) as models,
  (SELECT COUNT(*) FROM public.model_rows WHERE created_by = u.id) as rows,
  (SELECT COUNT(*) FROM public.jobs WHERE user_id = u.id) as jobs,
  (SELECT COUNT(*) FROM public.generated_images WHERE user_id = u.id) as images
FROM auth.users u
WHERE u.email = 'passarthur2003@icloud.com';

-- Show images with storage URLs
SELECT 
  'Image URLs Status' as check_type,
  COUNT(*) FILTER (WHERE output_url LIKE 'outputs/%') as images_with_storage_urls,
  COUNT(*) FILTER (WHERE output_url NOT LIKE 'outputs/%') as images_with_other_urls,
  COUNT(*) as total_images
FROM public.generated_images
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'passarthur2003@icloud.com');

-- Show recent restored images
SELECT 
  'Recent Restored Images' as check_type,
  id,
  output_url,
  created_at
FROM public.generated_images
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'passarthur2003@icloud.com')
ORDER BY created_at DESC
LIMIT 20;

SELECT 
  'Restoration Complete' as status,
  'All images from storage have been restored to your account' as message,
  'Log in and check your profile to see all restored images' as next_step;

