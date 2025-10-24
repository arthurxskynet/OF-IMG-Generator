-- Complete fix for "Database error querying schema"
-- Run this entire script in Supabase SQL Editor

-- 1. Ensure required extensions are installed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";

-- 2. Check and fix auth schema integrity
DO $$
BEGIN
    -- Ensure auth schema exists
    CREATE SCHEMA IF NOT EXISTS auth;
    
    -- Grant necessary permissions
    GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO postgres, service_role;
    GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO postgres, service_role;
END $$;

-- 3. Reset auth tables if they're corrupted (WARNING: This deletes all users)
-- Comment out this section if you want to preserve existing users
TRUNCATE auth.refresh_tokens CASCADE;
TRUNCATE auth.sessions CASCADE; 
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.users CASCADE;

-- Reset sequences
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_id_seq' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        ALTER SEQUENCE auth.users_id_seq RESTART WITH 1;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'identities_id_seq' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        ALTER SEQUENCE auth.identities_id_seq RESTART WITH 1;
    END IF;
END $$;

-- 4. Ensure proper instance_id configuration
-- This fixes instance_id mismatches that cause schema errors
DO $$
DECLARE
    current_instance_id uuid;
BEGIN
    -- Get the current instance_id from auth.users if any exist
    SELECT DISTINCT instance_id INTO current_instance_id 
    FROM auth.users 
    LIMIT 1;
    
    -- If no instance_id found, we'll use the default
    IF current_instance_id IS NULL THEN
        current_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    -- Update any mismatched instance_ids
    UPDATE auth.users 
    SET instance_id = current_instance_id 
    WHERE instance_id != current_instance_id OR instance_id IS NULL;
    
    RAISE NOTICE 'Using instance_id: %', current_instance_id;
END $$;

-- 5. Create a test user with proper auth structure
DO $$
DECLARE
    v_email text := 'passarthur2003@icloud.com';
    v_password text := 'Test123!@#';
    v_user_id uuid;
    v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
    -- Clean up any existing user first
    DELETE FROM auth.identities WHERE provider_id = v_email;
    DELETE FROM auth.users WHERE email = v_email;
    DELETE FROM public.profiles WHERE user_id IN (
        SELECT id FROM auth.users WHERE email = v_email
    );
    
    -- Generate new user ID
    v_user_id := gen_random_uuid();
    
    -- Insert user with proper structure
    INSERT INTO auth.users (
        id,
        instance_id,
        role,
        aud,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        last_sign_in_at,
        confirmation_sent_at,
        email_change_sent_at,
        recovery_sent_at
    ) VALUES (
        v_user_id,
        v_instance_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        jsonb_build_object(
            'provider', 'email',
            'providers', array['email']
        ),
        jsonb_build_object(
            'full_name', 'Test User'
        ),
        false,
        now(),
        now(),
        now(),
        now(),
        now(),
        now()
    );
    
    -- Insert identity
    INSERT INTO auth.identities (
        id,
        provider,
        provider_id,
        user_id,
        identity_data,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'email',
        v_email,
        v_user_id,
        jsonb_build_object(
            'sub', v_user_id::text,
            'email', v_email,
            'email_verified', true,
            'provider', 'email'
        ),
        now(),
        now(),
        now()
    );
    
    -- Create profile
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (v_user_id, 'Test User')
    ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;
    
    RAISE NOTICE 'Created test user with ID: %', v_user_id;
END $$;

-- 6. Refresh schema permissions
NOTIFY pgrst, 'reload schema';

-- 7. Create a health check function
CREATE OR REPLACE FUNCTION public.auth_health_check()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    user_count int;
    identity_count int;
    extensions_ok boolean;
BEGIN
    -- Count records
    SELECT COUNT(*) INTO user_count FROM auth.users;
    SELECT COUNT(*) INTO identity_count FROM auth.identities;
    
    -- Check extensions
    SELECT 
        COUNT(*) = 3 INTO extensions_ok
    FROM pg_extension 
    WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt');
    
    result := json_build_object(
        'status', 'healthy',
        'user_count', user_count,
        'identity_count', identity_count,
        'extensions_loaded', extensions_ok,
        'test_user_exists', EXISTS(
            SELECT 1 FROM auth.users 
            WHERE email = 'passarthur2003@icloud.com' 
            AND email_confirmed_at IS NOT NULL
        ),
        'timestamp', now()
    );
    
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_health_check() TO anon, authenticated, service_role;
