import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_request: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const admin = createClient(url, service, { 
      global: { headers: { apikey: service } }
    })
    
    // Test basic connectivity first
    const { data: basicTest, error: basicError } = await admin
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (basicError) {
      return NextResponse.json({
        status: 'unhealthy',
        error: 'Basic connectivity failed',
        details: basicError.message
      }, { status: 500 })
    }
    
    // Call health check function
    const { data: health, error: healthError } = await admin.rpc('auth_health_check')
    
    if (healthError) {
      return NextResponse.json({
        status: 'unhealthy', 
        error: 'Health check function failed',
        details: healthError.message
      }, { status: 500 })
    }
    
    // Test auth operations
    let authWorks = false
    try {
      const { data: session } = await admin.auth.getSession()
      authWorks = true
    } catch (e: any) {
      authWorks = false
    }
    
    return NextResponse.json({
      ...health,
      auth_operations_work: authWorks,
      basic_connectivity: true
    })
  } catch (e: any) {
    return NextResponse.json({ 
      status: 'unhealthy',
      error: e?.message ?? 'failed',
      stack: e?.stack?.split('\n').slice(0, 3) 
    }, { status: 500 })
  }
}
