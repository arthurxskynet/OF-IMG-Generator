-- NUCLEAR AUTH RESET - This will fix "Database error querying schema"
-- WARNING: This deletes ALL users and auth data
-- Run this in Supabase SQL Editor

-- 1. Install/reinstall required extensions
DROP EXTENSION IF EXISTS "pgjwt" CASCADE;
DROP EXTENSION IF EXISTS "pgcrypto" CASCADE;
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;

CREATE EXTENSION "uuid-ossp";
CREATE EXTENSION "pgcrypto";
CREATE EXTENSION "pgjwt";

-- 2. Completely reset auth schema
TRUNCATE auth.refresh_tokens CASCADE;
TRUNCATE auth.sessions CASCADE;
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.users CASCADE;

-- Reset all auth sequences
DO $$
DECLARE
    seq_record RECORD;
BEGIN
    FOR seq_record IN 
        SELECT schemaname, sequencename 
        FROM pg_sequences 
        WHERE schemaname = 'auth'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1', seq_record.schemaname, seq_record.sequencename);
    END LOOP;
END $$;

-- 3. Fix auth schema permissions (critical for GoTrue)
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO postgres, service_role;

-- Grant specific permissions that GoTrue needs
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.identities TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sessions TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.refresh_tokens TO postgres, service_role;

-- 4. Refresh the schema cache (forces GoTrue to reload)
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 5. Create a properly structured test user
DO $$
DECLARE
    v_user_id uuid := gen_random_uuid();
    v_instance_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    -- Insert user with all required fields for GoTrue
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
        recovery_sent_at,
        invited_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
    ) VALUES (
        v_user_id,
        v_instance_id,
        'authenticated',
        'authenticated',
        'passarthur2003@icloud.com',
        crypt('Test123!@#', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Test User"}'::jsonb,
        false,
        now(),
        now(),
        null,
        null,
        null,
        null,
        null,
        '',
        '',
        '',
        ''
    );

    -- Insert identity with proper structure
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
        'passarthur2003@icloud.com',
        v_user_id,
        jsonb_build_object(
            'sub', v_user_id::text,
            'email', 'passarthur2003@icloud.com',
            'email_verified', true,
            'provider', 'email'
        ),
        null,
        now(),
        now()
    );

    -- Create profile in public schema
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (v_user_id, 'Test User')
    ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Successfully created test user: % with ID: %', 'passarthur2003@icloud.com', v_user_id;
END $$;

-- 6. Verify everything is working
SELECT 
    'Auth Reset Complete' as status,
    COUNT(*) as user_count
FROM auth.users;

SELECT 
    u.email,
    u.email_confirmed_at IS NOT NULL as confirmed,
    i.provider,
    u.created_at
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'passarthur2003@icloud.com';
