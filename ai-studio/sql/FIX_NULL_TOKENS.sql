-- ============================================
-- FIX NULL TOKEN VALUES IN AUTH.USERS
-- This fixes the login 500 errors
-- ============================================

-- Fix NULL confirmation_token values
UPDATE auth.users 
SET confirmation_token = COALESCE(confirmation_token, '')
WHERE confirmation_token IS NULL;

-- Fix NULL email_change values
UPDATE auth.users 
SET email_change = COALESCE(email_change, '')
WHERE email_change IS NULL;

-- Verify the fix
SELECT 
  'After Fix' as check_type,
  COUNT(*) FILTER (WHERE confirmation_token IS NULL) as null_confirmation_token,
  COUNT(*) FILTER (WHERE email_change IS NULL) as null_email_change,
  COUNT(*) as total_users
FROM auth.users;

-- Show which users were fixed
SELECT 
  id,
  email,
  CASE 
    WHEN confirmation_token IS NULL THEN '❌ NULL confirmation_token'
    WHEN email_change IS NULL THEN '❌ NULL email_change'
    ELSE '✓ OK'
  END as issue_status
FROM auth.users
WHERE confirmation_token IS NULL OR email_change IS NULL;

