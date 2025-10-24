import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  
  if (!email || !password) {
    return NextResponse.json({ error: 'Missing email/password' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !anon) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    // Make direct HTTP request to Supabase auth endpoint
    const authUrl = `${url}/auth/v1/token?grant_type=password`
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anon,
        'Authorization': `Bearer ${anon}`,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    })

    const responseText = await response.text()
    let responseData
    
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
      url: authUrl,
      requestHeaders: {
        'Content-Type': 'application/json',
        'apikey': `${anon.slice(0, 10)}...`,
        'Authorization': `Bearer ${anon.slice(0, 10)}...`,
      }
    })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Fetch failed',
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 3)
    }, { status: 500 })
  }
}
