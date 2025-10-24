-- Test Authentication Script
-- Run this AFTER running complete-user-fix.sql
-- This script tests if the users can authenticate properly

-- Test 1: Check if all users exist and have correct structure
SELECT 
  'User Existence Test' as test_name,
  u.email,
  CASE 
    WHEN u.id IS NOT NULL THEN '✅ User exists'
    ELSE '❌ User missing'
  END as user_status,
  CASE 
    WHEN u.email_confirmed_at IS NOT NULL THEN '✅ Email confirmed'
    ELSE '❌ Email not confirmed'
  END as email_status,
  CASE 
    WHEN u.encrypted_password IS NOT NULL THEN '✅ Password set'
    ELSE '❌ No password'
  END as password_status
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Test 2: Check identity records
SELECT 
  'Identity Test' as test_name,
  u.email,
  CASE 
    WHEN i.id IS NOT NULL THEN '✅ Identity exists'
    ELSE '❌ Identity missing'
  END as identity_status,
  CASE 
    WHEN i.identity_data->'email_verified' = 'true' THEN '✅ Email verified in identity'
    ELSE '❌ Email not verified in identity'
  END as verification_status,
  CASE 
    WHEN i.identity_data->'sub' IS NOT NULL THEN '✅ Sub field exists'
    ELSE '❌ Sub field missing'
  END as sub_status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id AND i.provider = 'email'
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Test 3: Check profile records
SELECT 
  'Profile Test' as test_name,
  u.email,
  CASE 
    WHEN p.user_id IS NOT NULL THEN '✅ Profile exists'
    ELSE '❌ Profile missing'
  END as profile_status,
  p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Test 4: Data structure comparison with working user
SELECT 
  'Structure Comparison' as test_name,
  u.email,
  CASE 
    WHEN u.raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb THEN '✅ App metadata correct'
    ELSE '❌ App metadata incorrect'
  END as app_metadata_status,
  CASE 
    WHEN u.raw_user_meta_data = '{}'::jsonb THEN '✅ User metadata correct'
    ELSE '❌ User metadata incorrect'
  END as user_metadata_status,
  CASE 
    WHEN u.instance_id = '00000000-0000-0000-0000-000000000000'::uuid THEN '✅ Instance ID correct'
    ELSE '❌ Instance ID incorrect'
  END as instance_id_status,
  CASE 
    WHEN u.aud = 'authenticated' THEN '✅ Aud correct'
    ELSE '❌ Aud incorrect'
  END as aud_status,
  CASE 
    WHEN u.role = 'authenticated' THEN '✅ Role correct'
    ELSE '❌ Role incorrect'
  END as role_status
FROM auth.users u
WHERE u.email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
ORDER BY u.email;

-- Test 5: Password verification test (simulate auth check)
DO $$
DECLARE
  test_email text;
  test_password text;
  stored_hash text;
  verification_result boolean;
  user_record record;
BEGIN
  -- Test each user's password
  FOR user_record IN 
    SELECT email, 
           CASE 
             WHEN email = 'passarthur2003@icloud.com' THEN 'Test123!@#'
             WHEN email = '15nicholls444@gmail.com' THEN 'PasswordCosa4'
             WHEN email = 'Neickomarsh02@gmail.com' THEN 'PUMPUMaccess1'
           END as password
    FROM auth.users 
    WHERE email IN ('passarthur2003@icloud.com', '15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
  LOOP
    -- Get stored password hash
    SELECT encrypted_password INTO stored_hash 
    FROM auth.users 
    WHERE email = user_record.email;
    
    -- Test password verification
    SELECT (stored_hash = crypt(user_record.password, stored_hash)) INTO verification_result;
    
    RAISE NOTICE 'Password test for %: %', 
      user_record.email, 
      CASE WHEN verification_result THEN '✅ PASS' ELSE '❌ FAIL' END;
  END LOOP;
END $$;

-- Final test summary
SELECT 
  '=== AUTHENTICATION TEST SUMMARY ===' as summary,
  'All tests completed. Check the results above.' as message,
  'If all tests show ✅, the users should be able to authenticate.' as next_step;
