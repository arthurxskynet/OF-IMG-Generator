import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const admin = createClient(url, service, { global: { headers: { apikey: service } } })
    const client = createClient(url, anon, { global: { headers: { apikey: anon } } })
    
    // Test basic connectivity
    const { data: testQuery, error: testError } = await admin
      .from('profiles')
      .select('count')
      .limit(1)
    
    // Test auth tables access
    let authTablesAccessible = false
    try {
      const { data: users } = await admin.auth.admin.listUsers()
      authTablesAccessible = true
    } catch (e: any) {
      authTablesAccessible = false
    }
    
    // Test client auth
    let clientAuthWorks = false
    try {
      const { data: session } = await client.auth.getSession()
      clientAuthWorks = true
    } catch (e: any) {
      clientAuthWorks = false
    }

    return NextResponse.json({
      connectivity: {
        adminClient: !testError,
        authTablesAccessible,
        clientAuthWorks
      },
      testError: testError?.message || null,
      url: url.replace(/(https?:\/\/)(.{3}).+?(\..+)/, '$1$2***$3'),
      timestamp: new Date().toISOString()
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'failed',
      stack: e?.stack?.split('\n').slice(0, 3) 
    }, { status: 500 })
  }
}

