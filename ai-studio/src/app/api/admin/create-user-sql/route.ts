import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing SUPABASE env' }, { status: 500 })
  }
  
  try {
    const { email = 'passarthur2003@icloud.com', password = 'Test123!@#' } = await req.json().catch(() => ({}))
    const admin = createClient(url, service, { global: { headers: { apikey: service } } })

    // Clean up any existing user first
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
    
    if (existing) {
      await admin.auth.admin.deleteUser(existing.id)
    }

    // Create user via raw SQL to bypass any auth provider restrictions
    const { data: sqlResult, error: sqlError } = await admin.rpc('create_test_user_sql', {
      user_email: email,
      user_password: password
    })

    if (sqlError) {
      // Fallback: try the admin API again
      const { data: created, error: adminError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Test User' }
      })
      
      if (adminError) {
        return NextResponse.json({ 
          error: `Both SQL and Admin API failed. SQL: ${sqlError.message}, Admin: ${adminError.message}` 
        }, { status: 500 })
      }

      return NextResponse.json({ 
        ok: true, 
        method: 'admin_api',
        id: created.user?.id, 
        email: created.user?.email
      })
    }

    return NextResponse.json({ 
      ok: true, 
      method: 'sql',
      result: sqlResult
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Exception: ${e?.message ?? 'failed'}` }, { status: 500 })
  }
}

