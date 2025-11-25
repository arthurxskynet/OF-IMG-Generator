-- ============================================
-- FIX gen_random_uuid ISSUE
-- If gen_random_uuid doesn't exist, this will fix it
-- ============================================

-- Option 1: Enable pgcrypto extension (provides gen_random_uuid in some versions)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Option 2: If gen_random_uuid still doesn't exist, create an alias
DO $$
BEGIN
  -- Test if gen_random_uuid exists
  PERFORM gen_random_uuid();
  RAISE NOTICE 'gen_random_uuid() exists - no fix needed';
EXCEPTION WHEN undefined_function THEN
  -- Create a function alias using uuid_generate_v4
  CREATE OR REPLACE FUNCTION gen_random_uuid()
  RETURNS uuid
  LANGUAGE sql
  AS $$
    SELECT uuid_generate_v4();
  $$;
  RAISE NOTICE 'Created gen_random_uuid() alias using uuid_generate_v4()';
END $$;

-- Verify it works
SELECT 
  'Verification' as check_type,
  gen_random_uuid() as test_uuid,
  '✓ gen_random_uuid() now works' as status;


