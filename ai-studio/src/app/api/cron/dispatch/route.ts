import { NextRequest, NextResponse } from 'next/server'

export const runtime = "nodejs"

/**
 * Cron endpoint to periodically trigger the dispatcher
 * This ensures jobs don't get stuck in the queue if the event-driven
 * dispatch calls fail or are missed.
 * 
 * Configure in Vercel:
 * - Add a Vercel Cron job that calls this endpoint every minute
 * - Or use GitHub Actions / external cron service
 * 
 * Example vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/dispatch",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // Verify this is a legitimate cron call
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call the dispatcher
    const dispatchUrl = new URL('/api/dispatch', req.url)
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      cache: 'no-store'
    })

    const result = await response.json()
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      dispatchResult: result
    })
  } catch (error) {
    console.error('Cron dispatch error:', error)
    return NextResponse.json({ 
      error: 'Cron dispatch failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
