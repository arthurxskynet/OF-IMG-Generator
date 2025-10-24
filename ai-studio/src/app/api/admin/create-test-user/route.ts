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

    // Delete existing user if any
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
    
    if (existing) {
      await admin.auth.admin.deleteUser(existing.id)
    }

    // Create fresh user
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test User' }
    })
    
    if (error) {
      return NextResponse.json({ error: `Create user failed: ${error.message}` }, { status: 500 })
    }

    if (!created.user) {
      return NextResponse.json({ error: 'User creation returned no user object' }, { status: 500 })
    }

    // Create profile
    try {
      await admin.from('profiles').insert({
        user_id: created.user.id,
        full_name: 'Test User'
      })
    } catch (profileError: any) {
      console.warn('Profile creation failed:', profileError)
      // Continue anyway - profile creation is optional
    }

    return NextResponse.json({ 
      ok: true, 
      id: created.user.id, 
      email: created.user.email,
      action: 'created',
      confirmed: created.user.email_confirmed_at
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Exception: ${e?.message ?? 'failed'}` }, { status: 500 })
  }
}


