import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Create admin user using Supabase Admin API
 * This is the recommended way to create users that will work with authentication
 */
export async function POST(req: NextRequest) {
  try {
    const { email = 'arthurmarshall@cosa-ai.co.uk', password = 'Admin123!@#' } = await req.json().catch(() => ({}));

    // Check if user already exists (with error handling)
    let existing = null;
    try {
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && existingUsers?.users) {
        existing = existingUsers.users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );
      }
    } catch (listErr) {
      console.warn('[Create Admin] Could not list users, proceeding anyway:', listErr);
    }

    if (existing) {
      // Delete existing user to recreate
      try {
        await supabaseAdmin.auth.admin.deleteUser(existing.id);
        console.log('[Create Admin] Deleted existing user:', existing.id);
      } catch (deleteErr) {
        console.warn('[Create Admin] Could not delete user, may need manual cleanup:', deleteErr);
      }
    }

    // Create user using Admin API (recommended method)
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: 'Admin User' }
    });

    if (createError || !created.user) {
      console.error('[Create Admin] Admin API failed:', createError);
      return NextResponse.json(
        { error: `Failed to create user: ${createError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Create profile with admin flag
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
      console.error('[Create Admin] Profile creation failed:', profileError);
      // Don't fail - profile can be updated later
    }

    return NextResponse.json({
      success: true,
      user: {
        id: created.user.id,
        email: created.user.email,
        email_confirmed: created.user.email_confirmed_at !== null
      },
      message: 'Admin user created successfully. You can now log in.'
    });
  } catch (error: any) {
    console.error('[Create Admin] Exception:', error);
    return NextResponse.json(
      { error: `Exception: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

