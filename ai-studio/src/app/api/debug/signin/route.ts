import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: 'Missing env' }, { status: 500 })
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) return NextResponse.json({ error: 'Missing email/password' }, { status: 400 })

  try {
    const client = createClient(url, anon, { 
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { apikey: anon } }
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) return NextResponse.json({ ok: false, stage: 'supabase-js', error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, user: data.user?.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, stage: 'exception', error: e?.message ?? 'failed' }, { status: 500 })
  }
}



