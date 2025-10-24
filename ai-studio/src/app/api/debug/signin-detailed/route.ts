import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AuthFlowType } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  console.log('=== SIGNIN DEBUG ===')
  console.log('URL:', url ? `${url.slice(0, 20)}...` : 'MISSING')
  console.log('ANON Key:', anon ? `${anon.slice(0, 10)}...` : 'MISSING')
  
  if (!url || !anon) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }
  
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Missing email/password' }, { status: 400 })
  }

  console.log('Email:', email)
  console.log('Password length:', password?.length || 0)

  try {
    // Create client with explicit configuration
    const client = createClient(url, anon, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: 'implicit' as AuthFlowType // Try implicit instead of PKCE for server-side
      },
      global: {
        headers: {
          'apikey': anon,
          'Authorization': `Bearer ${anon}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      },
      db: {
        schema: 'public'
      }
    })

    console.log('Client created successfully')

    // Test basic connectivity first
    const { data: testData, error: testError } = await client
      .from('profiles')
      .select('count')
      .limit(1)

    console.log('Basic connectivity test:', { testData, testError: testError?.message })

    // Attempt sign in
    console.log('Attempting signInWithPassword...')
    const { data, error } = await client.auth.signInWithPassword({ 
      email, 
      password 
    })

    console.log('SignIn result:', {
      success: !error,
      error: error?.message,
      userId: data?.user?.id,
      sessionExists: !!data?.session
    })

    if (error) {
      return NextResponse.json({ 
        ok: false, 
        stage: 'supabase-auth', 
        error: error.message,
        code: error.status,
        details: {
          name: error.name,
          cause: error.cause
        }
      }, { status: 400 })
    }

    return NextResponse.json({ 
      ok: true, 
      user: data.user?.id,
      email: data.user?.email,
      confirmed: data.user?.email_confirmed_at
    })
  } catch (e: any) {
    console.error('Exception during signin:', e)
    return NextResponse.json({ 
      ok: false, 
      stage: 'exception', 
      error: e?.message ?? 'failed',
      stack: e?.stack?.split('\n').slice(0, 5)
    }, { status: 500 })
  }
}
