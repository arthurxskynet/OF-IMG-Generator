import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !service) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const admin = createClient(url, service)
    
    // Check if tables exist
    const tables = ['profiles', 'teams', 'team_members', 'models', 'model_rows', 'jobs', 'generated_images']
    const tableChecks: Record<string, boolean> = {}
    
    for (const table of tables) {
      try {
        const { error } = await admin.from(table).select('*').limit(1)
        tableChecks[table] = !error
      } catch {
        tableChecks[table] = false
      }
    }
    
    // Check if test user exists
    const { data: users } = await admin.auth.admin.listUsers()
    const testUser = users?.users?.find(u => u.email === 'passarthur2003@icloud.com')
    
    return NextResponse.json({
      tables: tableChecks,
      testUser: testUser ? { id: testUser.id, email: testUser.email, confirmed: testUser.email_confirmed_at } : null,
      totalUsers: users?.users?.length || 0
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 })
  }
}
