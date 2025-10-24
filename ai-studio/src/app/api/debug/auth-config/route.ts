import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const admin = createClient(url, service, { 
      global: { headers: { apikey: service } }
    })
    
    // Call our diagnostic function
    const { data: config, error: configError } = await admin.rpc('check_auth_config')
    
    return NextResponse.json({
      config: config || {},
      configError: configError?.message || null,
      timestamp: new Date().toISOString()
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'failed',
      stack: e?.stack?.split('\n').slice(0, 3) 
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const { email = 'passarthur2003@icloud.com', password = 'Test123!@#' } = await req.json().catch(() => ({}))
    const admin = createClient(url, service, { 
      global: { headers: { apikey: service } }
    })
    
    // Use our safe creation function
    const { data: result, error } = await admin.rpc('create_test_user_safe', {
      user_email: email,
      user_password: password
    })
    
    if (error) {
      return NextResponse.json({ 
        error: `Safe creation failed: ${error.message}` 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      result: result
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: `Exception: ${e?.message ?? 'failed'}` 
    }, { status: 500 })
  }
}
