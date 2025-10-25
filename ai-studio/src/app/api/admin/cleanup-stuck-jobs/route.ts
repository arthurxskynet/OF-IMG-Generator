import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = "nodejs"

/**
 * Manual cleanup endpoint for stuck jobs
 * This can be called manually or via cron to clean up any stuck jobs
 */
export async function POST(req: NextRequest) {
  try {
    // Verify this is a legitimate admin call
    const authHeader = req.headers.get('authorization')
    const adminSecret = process.env.ADMIN_SECRET
    
    if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = supabaseAdmin
    const results = {
      stuckQueued: 0,
      stuckSaving: 0,
      stuckRunning: 0,
      totalCleaned: 0
    }

    // Clean up stuck queued jobs (2+ minutes old)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    
    // First, find stuck queued jobs
    const { data: stuckQueuedJobs } = await supabase.from('jobs')
      .select('id, row_id')
      .eq('status', 'queued')
      .lt('created_at', twoMinAgo)
    
    if (stuckQueuedJobs && stuckQueuedJobs.length > 0) {
      // Update them to failed
      await supabase.from('jobs')
        .update({ 
          status: 'failed', 
          error: 'manual cleanup: stuck in queue', 
          updated_at: new Date().toISOString() 
        })
        .eq('status', 'queued')
        .lt('created_at', twoMinAgo)
      
      results.stuckQueued = stuckQueuedJobs.length
    }

    // Clean up stuck saving jobs (2+ minutes old, no provider ID)
    const { data: stuckSavingJobs } = await supabase.from('jobs')
      .select('id, row_id')
      .eq('status', 'saving')
      .is('provider_request_id', null)
      .lt('updated_at', twoMinAgo)
    
    if (stuckSavingJobs && stuckSavingJobs.length > 0) {
      await supabase.from('jobs')
        .update({ 
          status: 'failed', 
          error: 'manual cleanup: stuck saving', 
          updated_at: new Date().toISOString() 
        })
        .eq('status', 'saving')
        .is('provider_request_id', null)
        .lt('updated_at', twoMinAgo)
      
      results.stuckSaving = stuckSavingJobs.length
    }

    // Clean up stuck running jobs (2+ minutes old, no provider ID)
    const { data: stuckRunningJobs } = await supabase.from('jobs')
      .select('id, row_id')
      .eq('status', 'running')
      .is('provider_request_id', null)
      .lt('updated_at', twoMinAgo)
    
    if (stuckRunningJobs && stuckRunningJobs.length > 0) {
      await supabase.from('jobs')
        .update({ 
          status: 'failed', 
          error: 'manual cleanup: stuck running', 
          updated_at: new Date().toISOString() 
        })
        .eq('status', 'running')
        .is('provider_request_id', null)
        .lt('updated_at', twoMinAgo)
      
      results.stuckRunning = stuckRunningJobs.length
    }

    results.totalCleaned = results.stuckQueued + results.stuckSaving + results.stuckRunning

    // Update row statuses for affected rows
    if (results.totalCleaned > 0) {
      const allAffectedJobs = [
        ...(stuckQueuedJobs || []),
        ...(stuckSavingJobs || []),
        ...(stuckRunningJobs || [])
      ]
      
      const rowIds = [...new Set(allAffectedJobs.map(job => job.row_id))]
      
      for (const rowId of rowIds) {
        const [{ count: remaining }, { count: succeeded }] = await Promise.all([
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', rowId)
            .in('status', ['queued', 'running', 'submitted', 'saving']),
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', rowId)
            .eq('status', 'succeeded')
        ])

        await supabase.from('model_rows').update({
          status: (remaining ?? 0) > 0
            ? 'partial'
            : (succeeded ?? 0) > 0
              ? 'done'
              : 'error'
        }).eq('id', rowId)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    })

  } catch (error) {
    console.error('Manual cleanup error:', error)
    return NextResponse.json({ 
      error: 'Manual cleanup failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}