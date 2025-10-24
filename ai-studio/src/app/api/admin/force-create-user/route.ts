import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !service || !anon) {
    return NextResponse.json({ error: 'Missing SUPABASE env' }, { status: 500 })
  }
  
  try {
    const { email = 'passarthur2003@icloud.com', password = 'Test123!@#' } = await req.json().catch(() => ({}))
    const admin = createClient(url, service, { global: { headers: { apikey: service } } })

    // Method 1: Try to sign up as if it's a regular signup (this often works even when admin API doesn't)
    const client = createClient(url, anon, { global: { headers: { apikey: anon } } })
    
    // First, try to sign up normally
    const { data: signupData, error: signupError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: 'Test User' }
      }
    })

    if (signupData.user && !signupError) {
      // If signup worked, confirm the email via admin
      try {
        await admin.auth.admin.updateUserById(signupData.user.id, {
          email_confirm: true
        })
      } catch (confirmError) {
        console.warn('Email confirmation failed:', confirmError)
      }

      // Create profile
      try {
        await admin.from('profiles').insert({
          user_id: signupData.user.id,
          full_name: 'Test User'
        })
      } catch (profileError) {
        console.warn('Profile creation failed:', profileError)
      }

      return NextResponse.json({ 
        ok: true, 
        method: 'signup',
        id: signupData.user.id, 
        email: signupData.user.email,
        confirmed: true
      })
    }

    // Method 2: If signup failed, try admin API
    const { data: adminData, error: adminError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test User' }
    })

    if (adminData.user && !adminError) {
      return NextResponse.json({ 
        ok: true, 
        method: 'admin',
        id: adminData.user.id, 
        email: adminData.user.email
      })
    }

    // Both methods failed
    return NextResponse.json({ 
      error: `All methods failed. Signup: ${signupError?.message || 'unknown'}, Admin: ${adminError?.message || 'unknown'}`,
      signupError: signupError?.message,
      adminError: adminError?.message
    }, { status: 500 })

  } catch (e: any) {
    return NextResponse.json({ error: `Exception: ${e?.message ?? 'failed'}` }, { status: 500 })
  }
}

