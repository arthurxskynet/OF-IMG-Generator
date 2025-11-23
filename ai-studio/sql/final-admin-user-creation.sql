-- FINAL Admin User Creation - Using Supabase Admin API via RPC
-- This creates a function that can be called to create the admin user properly
-- Run this in Supabase SQL Editor

-- First, create a function that uses the service role to create users properly
-- Note: This requires the service role key, so it's better to use the API route
-- But if you must use SQL, this is the safest approach

-- Alternative: Just update existing user to admin if they exist
-- This is safer than recreating

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
    -- User exists - just ensure profile has admin flag
    INSERT INTO public.profiles (user_id, full_name, is_admin)
    VALUES (v_user_id, 'Admin User', true)
    ON CONFLICT (user_id) DO UPDATE SET is_admin = true;
    
    -- Ensure email is confirmed
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;
    
    RAISE NOTICE '✅ Updated existing user to admin: %', v_user_id;
  ELSE
    RAISE NOTICE '❌ User does not exist. Please create user via:';
    RAISE NOTICE '   1. Supabase Dashboard → Authentication → Users → Add user';
    RAISE NOTICE '   2. Or call: POST /api/admin/create-admin-user';
    RAISE NOTICE '   Then run this script again to set admin flag.';
  END IF;
END $$;

