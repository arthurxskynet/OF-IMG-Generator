-- Complete Admin Setup Guide
-- Since API methods are failing, use this step-by-step approach

-- STEP 1: Clean up any broken admin user
DO $$
DECLARE
  v_email text := 'arthurmarshall@cosa-ai.co.uk';
  v_user_id uuid;
BEGIN
  -- Find existing user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Found existing user: %, cleaning up...', v_user_id;
    
    -- Delete all related data (cast UUID to text where needed)
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
    DELETE FROM auth.sessions WHERE user_id = v_user_id;
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM public.profiles WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;
    
    RAISE NOTICE '✅ Cleaned up existing user';
  ELSE
    RAISE NOTICE 'No existing user found';
  END IF;
END $$;

-- STEP 2: Verify cleanup
SELECT 
  'Cleanup Complete' as status,
  COUNT(*) as remaining_users
FROM auth.users
WHERE email = 'arthurmarshall@cosa-ai.co.uk';

-- STEP 3: After creating user via Supabase Dashboard, run this to set admin flag:
-- (Uncomment and run after Dashboard creation)
/*
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'arthurmarshall@cosa-ai.co.uk');

-- Verify admin flag is set
SELECT 
  u.email,
  p.is_admin,
  p.full_name,
  u.email_confirmed_at IS NOT NULL as email_confirmed
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE u.email = 'arthurmarshall@cosa-ai.co.uk';
*/

