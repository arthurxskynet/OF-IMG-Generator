# Create Admin User - Recommended Method

## Option 1: Use API Route (RECOMMENDED - Most Reliable)

Call the API endpoint to create the admin user using Supabase's Admin API:

```bash
curl -X POST http://localhost:3000/api/admin/create-admin-user \
  -H "Content-Type: application/json" \
  -d '{"email":"arthurmarshall@cosa-ai.co.uk","password":"Admin123!@#"}'
```

Or use the Supabase Dashboard → SQL Editor to call it via RPC if needed.

This method uses Supabase's official Admin API which properly handles authentication.

## Option 2: Use Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user"
3. Enter email: `arthurmarshall@cosa-ai.co.uk`
4. Enter password: `Admin123!@#`
5. Check "Auto Confirm User"
6. Click "Create user"
7. Then run this SQL to set admin flag:

```sql
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'arthurmarshall@cosa-ai.co.uk');
```

