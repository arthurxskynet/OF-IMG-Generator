# Auth Issue Diagnosis

## Problem
Getting "Database error checking email" and "Database error finding user" when trying to create users or sign in.

## Root Cause Analysis
This error typically indicates one of these issues:

1. **Email Provider Disabled**: Email authentication is not enabled in Supabase
2. **Auth Schema Issues**: The auth.users or auth.identities tables have issues
3. **RLS Conflicts**: Row Level Security is blocking auth operations
4. **Instance ID Mismatch**: Wrong instance_id in auth.users table
5. **Missing Auth Extensions**: Required PostgreSQL extensions not enabled

## Immediate Steps to Fix

### Step 1: Check Supabase Dashboard Settings
Go to your Supabase Dashboard → Authentication → Providers:
- **Email Provider**: Must be ENABLED
- **Confirm email**: Can be disabled for testing
- **Secure email change**: Can be disabled for testing

### Step 2: Check Auth Settings
Go to Authentication → Settings:
- **Site URL**: Should be `http://localhost:3010`
- **Additional Redirect URLs**: Should include `http://localhost:3010`
- **Disable signup**: Should be OFF (enabled)

### Step 3: Reset Auth Schema (Nuclear Option)
If the above doesn't work, the auth schema might be corrupted. In Supabase SQL Editor:

```sql
-- WARNING: This will delete ALL users and auth data
TRUNCATE auth.users CASCADE;
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.sessions CASCADE;
TRUNCATE auth.refresh_tokens CASCADE;

-- Reset sequences
ALTER SEQUENCE IF EXISTS auth.users_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS auth.identities_id_seq RESTART WITH 1;
```

### Step 4: Manual User Creation (Last Resort)
If everything else fails, create user manually in Supabase Dashboard:
1. Go to Authentication → Users
2. Click "Add user"
3. Email: passarthur2003@icloud.com
4. Password: Test123!@#
5. Auto Confirm User: YES

## Testing Steps
After each fix attempt:
1. Test: `curl -X POST 'http://localhost:3010/api/debug/signin' -H 'content-type: application/json' --data '{"email":"passarthur2003@icloud.com","password":"Test123!@#"}'`
2. Expected: `{"ok":true,"user":"<uuid>"}`
3. If still failing, try next step

## Most Likely Fix
The issue is probably that **Email Provider is disabled** in the Supabase Dashboard. This is the #1 cause of "Database error checking email".

