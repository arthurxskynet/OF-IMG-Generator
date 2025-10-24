-- Simple auth diagnostics for Supabase
-- Run each section separately if needed

-- 1. Check extensions (most critical)
SELECT 
    extname as extension_name,
    extversion as version,
    extrelocatable as relocatable
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt')
ORDER BY extname;

-- 2. Check if auth schema exists
SELECT 
    nspname as schema_name,
    nspowner
FROM pg_namespace 
WHERE nspname = 'auth';

-- 3. Count auth tables
SELECT 
    'users' as table_name,
    COUNT(*) as count
FROM auth.users
UNION ALL
SELECT 
    'identities' as table_name,
    COUNT(*) as count
FROM auth.identities;

-- 4. Check our specific user
SELECT 
    id,
    email,
    email_confirmed_at IS NOT NULL as email_confirmed,
    encrypted_password IS NOT NULL as has_password,
    instance_id,
    aud,
    role,
    created_at
FROM auth.users 
WHERE email = 'passarthur2003@icloud.com';

-- 5. Check user's identity
SELECT 
    provider,
    provider_id,
    identity_data->'email_verified' as email_verified,
    created_at
FROM auth.identities 
WHERE provider_id = 'passarthur2003@icloud.com';

-- 6. Install missing extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";

-- 7. Clean up and recreate test user
DELETE FROM auth.identities WHERE provider_id = 'passarthur2003@icloud.com';
DELETE FROM auth.users WHERE email = 'passarthur2003@icloud.com';

-- 8. Create fresh test user
DO $$
DECLARE
    v_user_id uuid := gen_random_uuid();
BEGIN
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
        confirmation_sent_at
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
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
        now(),
        now()
    );

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
        now(),
        now(),
        now()
    );

    RAISE NOTICE 'Created fresh test user with ID: %', v_user_id;
END $$;

-- 9. Verify the user was created correctly
SELECT 
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL as confirmed,
    i.provider,
    i.identity_data->'email_verified' as email_verified
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'passarthur2003@icloud.com';
