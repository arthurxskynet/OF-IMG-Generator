import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminUser } from '@/lib/admin'

/**
 * POST /api/jobs/cleanup
 * 
 * Cleans up stuck jobs across all statuses:
 * - Queued jobs older than 2 minutes
 * - Submitted jobs without provider_request_id older than 90 seconds
 * - Running jobs without provider_request_id older than 5 minutes
 * - Saving jobs older than 10 minutes
 * - Stale jobs (any status) older than 1 hour
 * 
 * Also updates both model_rows and variant_rows statuses appropriately.
 * 
 * Can be called:
 * - On-demand by admins
 * - Periodically by dispatch route (every 10th call)
 * - By cron job for scheduled cleanup
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin

  // Allow unauthenticated calls for internal/cron use, but log them
  // For admin dashboard calls, check auth
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      // If auth header is present, verify it's an admin
      const isAdmin = await isAdminUser()
      if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
  } catch {
    // If auth check fails, allow the call (for internal/cron use)
    // This allows the dispatch route to call cleanup without auth
  }

  try {
    console.log('[Cleanup] Starting stuck jobs cleanup', { timestamp: new Date().toISOString() })

    // Use the database function for efficient bulk cleanup
    const { data: cleanupResult, error: cleanupError } = await supabase
      .rpc('cleanup_stuck_jobs')

    if (cleanupError) {
      console.error('[Cleanup] Database function error:', {
        code: cleanupError.code,
        message: cleanupError.message,
        details: cleanupError.details,
        hint: cleanupError.hint,
        error: cleanupError
      })
      // Fall back to manual cleanup if function doesn't exist or has errors
      console.log('[Cleanup] Falling back to manual cleanup')
      return await manualCleanup(supabase)
    }

    const result = cleanupResult?.[0] || {
      cleaned_count: 0,
      stuck_queued: 0,
      stuck_submitted: 0,
      stuck_running: 0,
      stuck_saving: 0,
      stale_jobs: 0
    }

    console.log('[Cleanup] Cleanup completed', {
      totalCleaned: result.cleaned_count,
      stuckQueued: result.stuck_queued,
      stuckSubmitted: result.stuck_submitted,
      stuckRunning: result.stuck_running,
      stuckSaving: result.stuck_saving,
      staleJobs: result.stale_jobs
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: result
    })

  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Manual cleanup fallback if database function doesn't exist
 */
async function manualCleanup(supabase: any) {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const ninetySecAgo = new Date(Date.now() - 90 * 1000).toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const results = {
    cleaned_count: 0,
    stuck_queued: 0,
    stuck_submitted: 0,
    stuck_running: 0,
    stuck_saving: 0,
    stale_jobs: 0
  }

  try {
    // Clean up queued jobs older than 2 minutes
    const { count: stuckQueued } = await supabase
      .from('jobs')
      .update({ status: 'failed', error: 'timeout: stuck in queue', updated_at: new Date().toISOString() })
      .eq('status', 'queued')
      .lt('created_at', twoMinAgo)
      .select('id', { count: 'exact', head: true })
    
    results.stuck_queued = stuckQueued || 0

    // Clean up submitted jobs without provider_request_id older than 90 seconds
    const { count: stuckSubmitted } = await supabase
      .from('jobs')
      .update({ status: 'failed', error: 'timeout: no provider request id', updated_at: new Date().toISOString() })
      .eq('status', 'submitted')
      .is('provider_request_id', null)
      .lt('created_at', ninetySecAgo)
      .select('id', { count: 'exact', head: true })
    
    results.stuck_submitted = stuckSubmitted || 0

    // Clean up running jobs without provider_request_id older than 5 minutes
    const { count: stuckRunning } = await supabase
      .from('jobs')
      .update({ status: 'failed', error: 'timeout: no provider request id', updated_at: new Date().toISOString() })
      .eq('status', 'running')
      .is('provider_request_id', null)
      .lt('updated_at', fiveMinAgo)
      .select('id', { count: 'exact', head: true })
    
    results.stuck_running = stuckRunning || 0

    // Clean up saving jobs older than 10 minutes
    const { count: stuckSaving } = await supabase
      .from('jobs')
      .update({ status: 'failed', error: 'timeout: stuck in saving', updated_at: new Date().toISOString() })
      .eq('status', 'saving')
      .lt('updated_at', tenMinAgo)
      .select('id', { count: 'exact', head: true })
    
    results.stuck_saving = stuckSaving || 0

    // Clean up any stale jobs older than 1 hour
    const { count: staleJobs } = await supabase
      .from('jobs')
      .update({ status: 'failed', error: 'timeout: stale job', updated_at: new Date().toISOString() })
      .in('status', ['queued', 'submitted', 'running', 'saving'])
      .lt('updated_at', oneHourAgo)
      .select('id', { count: 'exact', head: true })
    
    results.stale_jobs = staleJobs || 0

    results.cleaned_count = results.stuck_queued + results.stuck_submitted + results.stuck_running + results.stuck_saving + results.stale_jobs

    // Update variant row statuses
    const { data: affectedVariantRows } = await supabase
      .from('jobs')
      .select('variant_row_id')
      .eq('status', 'failed')
      .like('error', 'timeout:%')
      .not('variant_row_id', 'is', null)
      .gt('updated_at', new Date(Date.now() - 60 * 1000).toISOString())

    if (affectedVariantRows && affectedVariantRows.length > 0) {
      const variantRowIds = [...new Set(affectedVariantRows.map((j: { variant_row_id: string | null }) => j.variant_row_id).filter(Boolean))]
      console.log('[Cleanup] Updating variant row statuses', { variantRowIdsCount: variantRowIds.length, variantRowIds })
      
      for (const variantRowId of variantRowIds) {
        try {
          const { error: rpcError } = await supabase.rpc('update_variant_row_status', { p_variant_row_id: variantRowId })
          if (rpcError) {
            console.error('[Cleanup] Failed to update variant row status', {
              variantRowId,
              error: rpcError.message,
              errorCode: rpcError.code
            })
          } else {
            console.log('[Cleanup] Updated variant row status', { variantRowId })
          }
        } catch (rpcErr) {
          console.error('[Cleanup] Error updating variant row', {
            variantRowId,
            error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
          })
        }
      }
    }

    // Update model row statuses
    // Note: model_rows table does not have updated_at column, so we only update status
    const { data: affectedModelRows } = await supabase
      .from('jobs')
      .select('row_id')
      .eq('status', 'failed')
      .like('error', 'timeout:%')
      .not('row_id', 'is', null)
      .gt('updated_at', new Date(Date.now() - 60 * 1000).toISOString())

    if (affectedModelRows && affectedModelRows.length > 0) {
      const rowIds = [...new Set(affectedModelRows.map((j: { row_id: string | null }) => j.row_id).filter(Boolean))]
      console.log('[Cleanup] Updating model row statuses', { rowIdsCount: rowIds.length, rowIds })
      
      for (const rowId of rowIds) {
        try {
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

          const newStatus = (remaining ?? 0) > 0 ? 'partial' : (succeeded ?? 0) > 0 ? 'done' : 'error'
          const { error: updateError } = await supabase.from('model_rows').update({
            status: newStatus
            // Explicitly only update status - model_rows does not have updated_at column
          }).eq('id', rowId)
          
          if (updateError) {
            console.error('[Cleanup] Failed to update model row status', {
              rowId,
              newStatus,
              error: updateError.message,
              errorCode: updateError.code
            })
          } else {
            console.log('[Cleanup] Updated model row status', { rowId, newStatus, remaining, succeeded })
          }
        } catch (rowError) {
          console.error('[Cleanup] Error updating model row', {
            rowId,
            error: rowError instanceof Error ? rowError.message : String(rowError)
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    })
  } catch (error) {
    console.error('[Cleanup] Manual cleanup error:', error)
    throw error
  }
}

