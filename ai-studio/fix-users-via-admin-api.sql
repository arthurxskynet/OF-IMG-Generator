-- Fix Users via Admin API Approach
-- This script will clean up the problematic SQL-created users
-- Then use the admin API to recreate them properly

-- Step 1: Clean up all problematic users completely
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);
DELETE FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com');
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('15nicholls444@gmail.com', 'Neickomarsh02@gmail.com')
);

-- Step 2: Verify cleanup
SELECT '=== CLEANUP VERIFICATION ===' as step;

SELECT 
  'Users after cleanup' as check_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN email = 'passarthur2003@icloud.com' THEN 1 END) as working_user_count,
  COUNT(CASE WHEN email = '15nicholls444@gmail.com' THEN 1 END) as nicholls_user_count,
  COUNT(CASE WHEN email = 'Neickomarsh02@gmail.com' THEN 1 END) as neicko_user_count
FROM auth.users;

SELECT 
  'Identities after cleanup' as check_type,
  COUNT(*) as total_identities,
  COUNT(CASE WHEN provider_id = 'passarthur2003@icloud.com' THEN 1 END) as working_identity_count,
  COUNT(CASE WHEN provider_id = '15nicholls444@gmail.com' THEN 1 END) as nicholls_identity_count,
  COUNT(CASE WHEN provider_id = 'Neickomarsh02@gmail.com' THEN 1 END) as neicko_identity_count
FROM auth.identities;

-- Step 3: Instructions for using Admin API
SELECT '=== NEXT STEPS ===' as step;
SELECT '1. Run the following curl commands to create users via Admin API:' as instruction;
SELECT '2. curl -X POST "http://localhost:3000/api/debug/create-user-admin" -H "content-type: application/json" --data "{\"email\":\"15nicholls444@gmail.com\",\"password\":\"PasswordCosa4\",\"full_name\":\"Nicholls User\"}"' as command1;
SELECT '3. curl -X POST "http://localhost:3000/api/debug/create-user-admin" -H "content-type: application/json" --data "{\"email\":\"Neickomarsh02@gmail.com\",\"password\":\"PUMPUMaccess1\",\"full_name\":\"Neicko User\"}"' as command2;
SELECT '4. Test authentication with: ./test-login.sh' as command3;

-- Final summary
SELECT '=== SUMMARY ===' as step;
SELECT 'SQL-created users have been cleaned up' as message;
SELECT 'Use the Admin API commands above to recreate them properly' as next_step;
