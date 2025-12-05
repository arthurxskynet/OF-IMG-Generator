/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Create Admin User using Supabase Admin API
 * Run with: node scripts/create-admin-user.js
 * 
 * Requires environment variables:
 * - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✅' : '❌');
  console.error('\nMake sure these are set in .env.local');
  process.exit(1);
}

const adminEmail = 'arthurmarshall@cosa-ai.co.uk';
const adminPassword = 'Admin123!@#';

async function createAdminUser() {
  console.log('🚀 Creating admin user using Supabase Admin API...\n');

  // Create admin client with service role key
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        apikey: serviceRoleKey
      }
    }
  });

  try {
    // Step 1: Check if user already exists
    console.log('📋 Checking for existing user...');
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
      throw listError;
    }

    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
    );

    if (existing) {
      console.log(`⚠️  Found existing user: ${existing.id}`);
      console.log('🗑️  Deleting existing user...');
      
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existing.id);
      if (deleteError) {
        console.error('❌ Error deleting user:', deleteError.message);
        throw deleteError;
      }
      console.log('✅ Deleted existing user\n');
    } else {
      console.log('✅ No existing user found\n');
    }

    // Step 2: Create user using Admin API (Supabase recommended method)
    console.log('👤 Creating new admin user with Admin API...');
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: 'Admin User'
      }
    });

    if (createError) {
      console.error('❌ Error creating user:', createError.message);
      if (createError.details) {
        console.error('   Details:', createError.details);
      }
      throw createError;
    }

    if (!created.user) {
      throw new Error('User creation returned no user object');
    }

    console.log('✅ User created successfully!');
    console.log(`   ID: ${created.user.id}`);
    console.log(`   Email: ${created.user.email}`);
    console.log(`   Confirmed: ${created.user.email_confirmed_at ? 'Yes' : 'No'}\n`);

    // Step 3: Create/Update profile with admin flag
    console.log('🔧 Setting admin flag in profile...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: created.user.id,
        full_name: 'Admin User',
        is_admin: true
      }, {
        onConflict: 'user_id'
      });

    if (profileError) {
      console.error('⚠️  Warning: Profile creation failed:', profileError.message);
      console.log('\n   You can set the admin flag manually with this SQL:');
      console.log(`   UPDATE public.profiles SET is_admin = true WHERE user_id = '${created.user.id}';`);
    } else {
      console.log('✅ Admin flag set successfully!\n');
    }

    // Step 4: Verify setup
    console.log('🔍 Verifying setup...');
    const { data: profile, error: verifyError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, is_admin')
      .eq('user_id', created.user.id)
      .single();

    if (verifyError) {
      console.error('⚠️  Warning: Could not verify profile:', verifyError.message);
    } else {
      console.log('✅ Verification successful:');
      console.log(`   Admin flag: ${profile.is_admin ? '✅ true' : '❌ false'}`);
      console.log(`   Full name: ${profile.full_name}\n`);
    }

    // Success summary
    console.log('🎉 Admin user setup complete!\n');
    console.log('📝 Login credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');
    console.log('✅ You can now:');
    console.log('   - Log in to the application');
    console.log('   - Access /admin for admin dashboard');
    console.log('   - Access /admin/storage for storage gallery');

  } catch (error) {
    console.error('\n❌ Failed to create admin user:');
    console.error('   Error:', error.message);
    if (error.details) {
      console.error('   Details:', error.details);
    }
    if (error.status) {
      console.error('   Status:', error.status);
    }
    process.exit(1);
  }
}

// Run the script
createAdminUser();
