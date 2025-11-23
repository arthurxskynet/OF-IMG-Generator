-- ============================================
-- COMPREHENSIVE DIAGNOSTIC - Find ALL NULL columns
-- Run this to find what's causing the schema error
-- ============================================

-- Check ALL columns in auth.users for NULL values
-- This will show which columns have NULLs that might cause issues
SELECT 
  'NULL Values Check' as check_type,
  COUNT(*) FILTER (WHERE confirmation_token IS NULL) as null_confirmation_token,
  COUNT(*) FILTER (WHERE email_change IS NULL) as null_email_change,
  COUNT(*) FILTER (WHERE email_change_token IS NULL) as null_email_change_token,
  COUNT(*) FILTER (WHERE recovery_token IS NULL) as null_recovery_token,
  COUNT(*) FILTER (WHERE phone_change IS NULL) as null_phone_change,
  COUNT(*) FILTER (WHERE phone_change_token IS NULL) as null_phone_change_token,
  COUNT(*) FILTER (WHERE phone IS NULL) as null_phone,
  COUNT(*) FILTER (WHERE phone_confirmed_at IS NULL) as null_phone_confirmed_at,
  COUNT(*) as total_users
FROM auth.users;

-- Check which specific users have NULL values
SELECT 
  id,
  email,
  CASE WHEN confirmation_token IS NULL THEN 'confirmation_token' END as null_column_1,
  CASE WHEN email_change IS NULL THEN 'email_change' END as null_column_2,
  CASE WHEN email_change_token IS NULL THEN 'email_change_token' END as null_column_3,
  CASE WHEN recovery_token IS NULL THEN 'recovery_token' END as null_column_4,
  CASE WHEN phone_change IS NULL THEN 'phone_change' END as null_column_5,
  CASE WHEN phone_change_token IS NULL THEN 'phone_change_token' END as null_column_6
FROM auth.users
WHERE confirmation_token IS NULL 
   OR email_change IS NULL 
   OR email_change_token IS NULL 
   OR recovery_token IS NULL 
   OR phone_change IS NULL 
   OR phone_change_token IS NULL;

-- List all columns in auth.users to see what exists
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
ORDER BY ordinal_position;

