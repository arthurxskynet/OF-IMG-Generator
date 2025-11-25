-- ============================================
-- SET DEFAULT VALUES FOR TOKEN COLUMNS
-- GoTrue expects these to have non-NULL defaults
-- ============================================

-- Set defaults for token columns that currently default to NULL
-- This ensures new rows and existing NULL values are handled correctly

DO $$
DECLARE
  col_exists boolean;
BEGIN
  -- Check and set default for confirmation_token
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'confirmation_token'
  ) INTO col_exists;
  
  IF col_exists THEN
    ALTER TABLE auth.users 
    ALTER COLUMN confirmation_token SET DEFAULT '';
    RAISE NOTICE '✓ Set default for confirmation_token';
  END IF;

  -- Check and set default for recovery_token
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'recovery_token'
  ) INTO col_exists;
  
  IF col_exists THEN
    ALTER TABLE auth.users 
    ALTER COLUMN recovery_token SET DEFAULT '';
    RAISE NOTICE '✓ Set default for recovery_token';
  END IF;

  -- Check and set default for email_change_token_new
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'email_change_token_new'
  ) INTO col_exists;
  
  IF col_exists THEN
    ALTER TABLE auth.users 
    ALTER COLUMN email_change_token_new SET DEFAULT '';
    RAISE NOTICE '✓ Set default for email_change_token_new';
  END IF;

  -- Check and set default for email_change
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'email_change'
  ) INTO col_exists;
  
  IF col_exists THEN
    ALTER TABLE auth.users 
    ALTER COLUMN email_change SET DEFAULT '';
    RAISE NOTICE '✓ Set default for email_change';
  END IF;

  -- Update any remaining NULL values to empty strings
  UPDATE auth.users 
  SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, '')
  WHERE 
    confirmation_token IS NULL 
    OR recovery_token IS NULL 
    OR email_change_token_new IS NULL 
    OR email_change IS NULL;
  
  RAISE NOTICE '✓ Updated all NULL token values to empty strings';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error: %', SQLERRM;
END $$;

-- Verify the changes
SELECT 
  'Verification' as check_type,
  column_name,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
  AND column_name IN ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change')
ORDER BY column_name;


