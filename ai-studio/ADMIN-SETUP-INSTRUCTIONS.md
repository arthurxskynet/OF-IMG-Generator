# Admin User Setup Instructions

## Current Issue
The API methods are failing with "Database error checking email" which suggests there may be auth schema issues or a broken user in the database.

## Recommended Solution: Use Supabase Dashboard

### Step 1: Clean Up Existing User (if any)
Run this SQL in Supabase SQL Editor:
```sql
-- Clean up any broken admin user
DO $$
DECLARE
  v_email text := 'arthurmarshall@cosa-ai.co.uk';
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id;
    DELETE FROM auth.sessions WHERE user_id = v_user_id;
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM public.profiles WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;
END $$;
```

### Step 2: Create User via Supabase Dashboard
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** button
4. Fill in:
   - **Email**: `arthurmarshall@cosa-ai.co.uk`
   - **Password**: `Admin123!@#`
   - **Auto Confirm User**: ✅ (Check this box)
5. Click **"Create user"**

### Step 3: Set Admin Flag
After creating the user, run this SQL in Supabase SQL Editor:
```sql
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'arthurmarshall@cosa-ai.co.uk');
```

### Step 4: Verify Setup
Run this to verify everything is correct:
```sql
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.is_admin,
  p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE u.email = 'arthurmarshall@cosa-ai.co.uk';
```

You should see:
- `email_confirmed = true`
- `is_admin = true`

### Step 5: Test Login
1. Go to your app's login page
2. Login with:
   - Email: `arthurmarshall@cosa-ai.co.uk`
   - Password: `Admin123!@#`
3. You should see admin links in navigation (Admin, Storage)
4. Access `/admin` for admin dashboard
5. Access `/admin/storage` for storage gallery

## Alternative: If Dashboard Method Fails

If the Dashboard method also fails, there may be a deeper auth schema issue. In that case:

1. Check Supabase Dashboard → Settings → API for correct URLs and keys
2. Verify environment variables are set correctly
3. Check Supabase Dashboard → Database → Logs for any errors
4. Consider contacting Supabase support if the issue persists

## Troubleshooting

### If login still gives 500 errors:
1. Check browser console for specific error messages
2. Check Supabase Dashboard → Authentication → Users to verify user exists
3. Verify `email_confirmed_at` is not NULL
4. Check that `is_admin = true` in profiles table

### If admin features don't work:
1. Verify RLS policies are updated (run `sql/update-rls-policies-for-admin.sql`)
2. Verify storage policies are updated (run `sql/update-storage-policies-for-admin.sql`)
3. Check that `is_admin_user()` function exists and works

