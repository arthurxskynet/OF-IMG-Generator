import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'

export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    // Optional: Verify user has access to an entity that references this path before signing.
    // Keep it simple: allow if authenticated (RLS will gate when reading rows).

    const url = await signPath(path, 14400) // 4 hours instead of 1 hour
    const response = NextResponse.json({ url })
    
    // Add aggressive cache headers to reduce repeated requests
    // Cache for 1 hour, serve stale for 2 hours while revalidating
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200, s-maxage=3600')
    
    return response
  } catch (error) {
    console.error('Error signing path:', error)
    return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })
  }
}
