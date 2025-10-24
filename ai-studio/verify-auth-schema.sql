-- Verify auth schema and user existence
-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check if required extensions exist
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt')
ORDER BY extname;

-- 2. Check auth schema permissions
SELECT 
    n.nspname as schema_name,
    u.usename as schema_owner,
    n.nspacl as schema_acl
FROM pg_namespace n
JOIN pg_user u ON n.nspowner = u.usesysid
WHERE n.nspname = 'auth';

-- 3. Check if our test user exists
SELECT 
    id,
    email,
    email_confirmed_at,
    encrypted_password IS NOT NULL as has_password,
    raw_app_meta_data,
    instance_id,
    aud,
    role,
    created_at
FROM auth.users 
WHERE email = 'passarthur2003@icloud.com';

-- 4. Check identities for the user
SELECT 
    i.id,
    i.provider,
    i.provider_id,
    i.user_id,
    i.identity_data,
    i.created_at
FROM auth.identities i
JOIN auth.users u ON i.user_id = u.id
WHERE u.email = 'passarthur2003@icloud.com';

-- 5. Check auth configuration tables
SELECT 
    'auth.users' as table_name,
    COUNT(*) as record_count
FROM auth.users
UNION ALL
SELECT 
    'auth.identities' as table_name,
    COUNT(*) as record_count
FROM auth.identities
UNION ALL
SELECT 
    'auth.sessions' as table_name,
    COUNT(*) as record_count
FROM auth.sessions;

-- 6. Test password verification for our user
DO $$
DECLARE
    stored_password text;
    test_result boolean;
BEGIN
    -- Get the stored encrypted password
    SELECT encrypted_password INTO stored_password
    FROM auth.users 
    WHERE email = 'passarthur2003@icloud.com';
    
    IF stored_password IS NOT NULL THEN
        -- Test if the password matches
        test_result := (stored_password = crypt('Test123!@#', stored_password));
        RAISE NOTICE 'Password verification result: %', test_result;
        RAISE NOTICE 'Stored password exists: %', (stored_password IS NOT NULL);
    ELSE
        RAISE NOTICE 'No password found for user';
    END IF;
END $$;

-- 7. Create a minimal test user if needed
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Check if user exists
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'test-minimal@example.com';
    
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        
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
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'test-minimal@example.com',
            crypt('password123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb,
            now(),
            now()
        );
        
        INSERT INTO auth.identities (
            id,
            provider,
            provider_id,
            user_id,
            identity_data,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            'email',
            'test-minimal@example.com',
            v_user_id,
            jsonb_build_object(
                'sub', v_user_id::text,
                'email', 'test-minimal@example.com',
                'email_verified', true
            ),
            now(),
            now()
        );
        
        RAISE NOTICE 'Created minimal test user: %', v_user_id;
    ELSE
        RAISE NOTICE 'Minimal test user already exists: %', v_user_id;
    END IF;
END $$;
