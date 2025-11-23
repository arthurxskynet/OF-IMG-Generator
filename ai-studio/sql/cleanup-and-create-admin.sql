-- Clean up broken admin user and prepare for API creation
-- Run this first, then use the API route or Supabase Dashboard

-- Delete any existing broken admin user
DO $$
DECLARE
  v_email text := 'arthurmarshall@cosa-ai.co.uk';
  v_user_id uuid;
BEGIN
  -- Find and delete existing user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Deleting existing user: %', v_user_id;
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.sessions WHERE user_id = v_user_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
    DELETE FROM public.profiles WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;
    RAISE NOTICE '✅ Cleaned up existing user';
  ELSE
    RAISE NOTICE 'No existing user found';
  END IF;
END $$;

-- Verify cleanup
SELECT 
  'Cleanup Verification' as status,
  COUNT(*) as remaining_users
FROM auth.users
WHERE email = 'arthurmarshall@cosa-ai.co.uk';

