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
      global: { headers: { apikey: service } },
      db: { schema: 'auth' }
    })
    
    // Query auth.users directly
    const { data: users, error: usersError } = await admin
      .from('users')
      .select('id, email, email_confirmed_at, created_at')
      .limit(10)
    
    // Query auth.identities directly  
    const { data: identities, error: identitiesError } = await admin
      .from('identities')
      .select('id, provider, provider_id, user_id')
      .limit(10)

    return NextResponse.json({
      users: users || [],
      usersError: usersError?.message || null,
      identities: identities || [],
      identitiesError: identitiesError?.message || null,
      userCount: users?.length || 0
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'failed',
      stack: e?.stack?.split('\n').slice(0, 3) 
    }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const admin = createClient(url, service, { 
      global: { headers: { apikey: service } }
    })
    
    // Clean up auth tables directly via SQL
    const { error: cleanupError } = await admin.rpc('exec_sql', {
      sql: `
        DELETE FROM auth.identities WHERE provider_id = 'passarthur2003@icloud.com';
        DELETE FROM auth.users WHERE email = 'passarthur2003@icloud.com';
      `
    })

    if (cleanupError) {
      // Fallback: try individual deletes
      const { data: users } = await admin.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === 'passarthur2003@icloud.com')
      if (existing) {
        await admin.auth.admin.deleteUser(existing.id)
      }
    }

    return NextResponse.json({ ok: true, cleaned: true })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'failed'
    }, { status: 500 })
  }
}
