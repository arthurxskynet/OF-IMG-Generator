-- ============================================
-- DIAGNOSTIC SCRIPT - Check current database state
-- Run this FIRST to see what's broken
-- ============================================

-- 1. Check if problematic function exists
SELECT 
  'Function Check' as check_type,
  proname as function_name,
  CASE 
    WHEN proname = 'claim_jobs_with_capacity' THEN 'EXISTS - MAY BE BROKEN'
    WHEN proname = 'claim_jobs_global' THEN 'EXISTS - SHOULD BE OK'
    ELSE 'OTHER'
  END as status
FROM pg_proc
WHERE proname IN ('claim_jobs_with_capacity', 'claim_jobs_global')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check auth.users table structure
SELECT 
  'Auth Users Columns' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
  AND (column_name LIKE '%token%' OR column_name LIKE '%change%')
ORDER BY column_name;

-- 3. Check for NULL values in auth.users token fields
SELECT 
  'NULL Token Check' as check_type,
  COUNT(*) FILTER (WHERE confirmation_token IS NULL) as null_confirmation_token,
  COUNT(*) FILTER (WHERE email_change IS NULL) as null_email_change,
  COUNT(*) as total_users
FROM auth.users;

-- 4. Check if tables exist and have correct structure
SELECT 
  'Table Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IN ('profiles', 'teams', 'models', 'model_rows', 'jobs', 'generated_images') 
    THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'teams', 'models', 'model_rows', 'jobs', 'generated_images')
ORDER BY table_name;

-- 5. Check model_rows.target_image_url constraint
SELECT 
  'Column Check' as check_type,
  table_name,
  column_name,
  is_nullable,
  CASE 
    WHEN table_name = 'model_rows' AND column_name = 'target_image_url' AND is_nullable = 'NO'
    THEN 'SHOULD BE NULLABLE'
    ELSE 'OK'
  END as issue
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'model_rows' AND column_name = 'target_image_url')
    OR (table_name = 'models' AND column_name = 'max_concurrency')
    OR (table_name = 'models' AND column_name = 'variants_default'))
ORDER BY table_name, column_name;


