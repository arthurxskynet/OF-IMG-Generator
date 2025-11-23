-- ============================================
-- REASSIGN ORPHANED DATA TO EXISTING USERS
-- Use this script to manually reassign orphaned data
-- ============================================
-- 
-- INSTRUCTIONS:
-- 1. First run MIGRATE_OLD_DATA.sql to identify orphaned data
-- 2. Determine which existing user should own each orphaned record
-- 3. Update the variables below with the correct mappings
-- 4. Run this script
--
-- ============================================

-- ============================================
-- CONFIGURATION: Set your mappings here
-- ============================================

-- Example: If you have orphaned models owned by old_user_id_1,
-- and you want to reassign them to new_user_id_1, create a mapping
-- You can find user IDs by running: SELECT id, email FROM auth.users;

-- For Models: Map old owner_id to new owner_id
-- Example: old_user_id => new_user_id
-- You'll need to manually create these mappings based on your data

-- ============================================
-- HELPER FUNCTION: Reassign model ownership
-- ============================================

CREATE OR REPLACE FUNCTION reassign_model_ownership(
  p_model_id uuid,
  p_new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify new owner exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_new_owner_id) THEN
    RAISE EXCEPTION 'New owner user does not exist: %', p_new_owner_id;
  END IF;
  
  -- Verify model exists
  IF NOT EXISTS (SELECT 1 FROM public.models WHERE id = p_model_id) THEN
    RAISE EXCEPTION 'Model does not exist: %', p_model_id;
  END IF;
  
  -- Update model owner
  UPDATE public.models 
  SET owner_id = p_new_owner_id
  WHERE id = p_model_id;
  
  -- Also update all related rows, jobs, and images to the new owner
  UPDATE public.model_rows
  SET created_by = p_new_owner_id
  WHERE model_id = p_model_id;
  
  UPDATE public.jobs
  SET user_id = p_new_owner_id
  WHERE model_id = p_model_id;
  
  UPDATE public.generated_images
  SET user_id = p_new_owner_id
  WHERE model_id = p_model_id;
  
  RAISE NOTICE '✓ Reassigned model % to user %', p_model_id, p_new_owner_id;
END;
$$;

-- ============================================
-- HELPER FUNCTION: Reassign all data for a user
-- ============================================

CREATE OR REPLACE FUNCTION reassign_user_data(
  p_old_user_id uuid,
  p_new_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  models_updated int;
  rows_updated int;
  jobs_updated int;
  images_updated int;
BEGIN
  -- Verify new user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_new_user_id) THEN
    RAISE EXCEPTION 'New user does not exist: %', p_new_user_id;
  END IF;
  
  -- Update models
  UPDATE public.models 
  SET owner_id = p_new_user_id
  WHERE owner_id = p_old_user_id;
  GET DIAGNOSTICS models_updated = ROW_COUNT;
  
  -- Update model rows
  UPDATE public.model_rows
  SET created_by = p_new_user_id
  WHERE created_by = p_old_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  
  -- Update jobs
  UPDATE public.jobs
  SET user_id = p_new_user_id
  WHERE user_id = p_old_user_id;
  GET DIAGNOSTICS jobs_updated = ROW_COUNT;
  
  -- Update generated images
  UPDATE public.generated_images
  SET user_id = p_new_user_id
  WHERE user_id = p_old_user_id;
  GET DIAGNOSTICS images_updated = ROW_COUNT;
  
  RAISE NOTICE '✓ Reassigned data: % models, % rows, % jobs, % images', 
    models_updated, rows_updated, jobs_updated, images_updated;
  
  RETURN json_build_object(
    'models_updated', models_updated,
    'rows_updated', rows_updated,
    'jobs_updated', jobs_updated,
    'images_updated', images_updated
  );
END;
$$;

-- ============================================
-- EXAMPLE USAGE (commented out - uncomment and modify as needed)
-- ============================================

-- Example 1: Reassign a specific model
-- SELECT reassign_model_ownership(
--   'model-uuid-here'::uuid,
--   'new-user-uuid-here'::uuid
-- );

-- Example 2: Reassign all data from old user to new user
-- SELECT reassign_user_data(
--   'old-user-uuid-here'::uuid,
--   'new-user-uuid-here'::uuid
-- );

-- ============================================
-- QUERY TO FIND USER MAPPINGS BY EMAIL
-- ============================================

-- Use this query to find user IDs by email
-- SELECT 
--   id,
--   email,
--   created_at,
--   (SELECT COUNT(*) FROM public.models WHERE owner_id = auth.users.id) as models_count,
--   (SELECT COUNT(*) FROM public.model_rows WHERE created_by = auth.users.id) as rows_count
-- FROM auth.users
-- ORDER BY email;

-- ============================================
-- BATCH REASSIGNMENT SCRIPT
-- ============================================

-- If you have multiple orphaned records that should all go to the same user,
-- you can use this pattern:

-- DO $$
-- DECLARE
--   new_user_id uuid := 'your-new-user-id-here'::uuid;
--   orphaned_user_id uuid;
-- BEGIN
--   -- Find all orphaned user IDs (users that don't exist but have data)
--   FOR orphaned_user_id IN 
--     SELECT DISTINCT owner_id 
--     FROM public.models 
--     WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)
--   LOOP
--     -- Reassign to new user (or you might want to match by email if possible)
--     PERFORM reassign_user_data(orphaned_user_id, new_user_id);
--   END LOOP;
-- END $$;

-- ============================================
-- VERIFICATION AFTER REASSIGNMENT
-- ============================================

-- After running reassignments, verify with:
-- SELECT 
--   'Verification' as check_type,
--   COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id)) as orphaned_models,
--   COUNT(*) as total_models
-- FROM public.models;

