import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AuthFlowType } from '@supabase/supabase-js'

export async function GET(_: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  }

  try {
    // Test 1: Basic admin connectivity
    const admin = createClient(url, service, { 
      global: { headers: { apikey: service } }
    })
    
    const { data: profileTest, error: profileError } = await admin
      .from('profiles')
      .select('count')
      .limit(1)
    
    results.tests.admin_connectivity = {
      success: !profileError,
      error: profileError?.message
    }

    // Test 2: Auth admin functions
    try {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers()
      results.tests.auth_admin_access = {
        success: !usersError,
        error: usersError?.message,
        user_count: users?.users?.length || 0
      }
    } catch (e: any) {
      results.tests.auth_admin_access = {
        success: false,
        error: e.message
      }
    }

    // Test 3: Direct auth endpoint test
    try {
      const authResponse = await fetch(`${url}/auth/v1/settings`, {
        headers: {
          'apikey': anon,
          'Authorization': `Bearer ${anon}`
        }
      })
      
      const authSettings = await authResponse.json()
      results.tests.auth_settings_endpoint = {
        success: authResponse.ok,
        status: authResponse.status,
        data: authSettings
      }
    } catch (e: any) {
      results.tests.auth_settings_endpoint = {
        success: false,
        error: e.message
      }
    }

    // Test 4: Test different auth configurations
    const testConfigs = [
      { name: 'minimal', config: {} },
      { name: 'with_headers', config: { global: { headers: { apikey: anon } } } },
      { name: 'with_auth_config', config: {
        auth: { flowType: 'implicit' as AuthFlowType, autoRefreshToken: false, persistSession: false },
        global: { headers: { apikey: anon } }
      }}
    ]

    for (const testConfig of testConfigs) {
      try {
        const testClient = createClient(url, anon, testConfig.config)
        const { data: sessionData, error: sessionError } = await testClient.auth.getSession()
        
        results.tests[`client_${testConfig.name}`] = {
          success: !sessionError,
          error: sessionError?.message,
          has_session: !!sessionData?.session
        }
      } catch (e: any) {
        results.tests[`client_${testConfig.name}`] = {
          success: false,
          error: e.message
        }
      }
    }

    // Test 5: Check specific user via SQL
    try {
      const { data: userCheck, error: userError } = await admin.rpc('exec_sql', {
        sql: `
          SELECT 
            u.id,
            u.email,
            u.email_confirmed_at IS NOT NULL as confirmed,
            u.instance_id,
            u.aud,
            u.role,
            i.provider,
            i.identity_data->'email_verified' as email_verified
          FROM auth.users u
          LEFT JOIN auth.identities i ON u.id = i.user_id
          WHERE u.email = 'passarthur2003@icloud.com'
        `
      })

      results.tests.user_sql_check = {
        success: !userError,
        error: userError?.message,
        data: userCheck
      }
    } catch (e: any) {
      results.tests.user_sql_check = {
        success: false,
        error: e.message
      }
    }

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({
      error: 'Comprehensive test failed',
      message: e.message,
      results
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anon) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const { email = 'passarthur2003@icloud.com', password = 'Test123!@#' } = await req.json().catch(() => ({}))

  // Test multiple auth methods
  const authTests = []

  // Method 1: Direct fetch to auth endpoint
  try {
    const directResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anon,
        'Authorization': `Bearer ${anon}`,
      },
      body: JSON.stringify({ email, password })
    })

    const directResult = await directResponse.text()
    let directData
    try {
      directData = JSON.parse(directResult)
    } catch {
      directData = { raw: directResult }
    }

    authTests.push({
      method: 'direct_fetch',
      success: directResponse.ok,
      status: directResponse.status,
      data: directData
    })
  } catch (e: any) {
    authTests.push({
      method: 'direct_fetch',
      success: false,
      error: e.message
    })
  }

  // Method 2: Supabase client with minimal config
  try {
    const minimalClient = createClient(url, anon)
    const { data: minimalData, error: minimalError } = await minimalClient.auth.signInWithPassword({
      email,
      password
    })

    authTests.push({
      method: 'minimal_client',
      success: !minimalError,
      error: minimalError?.message,
      user_id: minimalData?.user?.id
    })
  } catch (e: any) {
    authTests.push({
      method: 'minimal_client',
      success: false,
      error: e.message
    })
  }

  // Method 3: Client with explicit config
  try {
    const configuredClient = createClient(url, anon, {
      auth: {
        flowType: 'implicit' as AuthFlowType,
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: { apikey: anon }
      }
    })

    const { data: configData, error: configError } = await configuredClient.auth.signInWithPassword({
      email,
      password
    })

    authTests.push({
      method: 'configured_client',
      success: !configError,
      error: configError?.message,
      user_id: configData?.user?.id
    })
  } catch (e: any) {
    authTests.push({
      method: 'configured_client',
      success: false,
      error: e.message
    })
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    auth_tests: authTests,
    summary: {
      any_success: authTests.some(t => t.success),
      all_failed: authTests.every(t => !t.success),
      common_errors: [...new Set(authTests.filter(t => !t.success).map(t => t.error))]
    }
  })
}
