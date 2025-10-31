import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = "nodejs"

/**
 * Cleanup endpoint for stuck prompt generation jobs
 * Finds prompt jobs stuck in 'processing' state and either requeues them or marks as failed
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
      stuckProcessing: 0,
      requeued: 0,
      failed: 0,
      dependentJobsUpdated: 0,
      totalCleaned: 0
    }

    // Find prompt jobs stuck in 'processing' state (> 30 minutes old)
    // This handles cases where API calls take longer or worker crashes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    
    const { data: stuckPromptJobs, error: fetchError } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, started_at')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinAgo)

    if (fetchError) {
      console.error('[CleanupStuckPromptJobs] Failed to fetch stuck jobs:', fetchError)
      return NextResponse.json({ 
        error: 'Failed to fetch stuck jobs',
        details: fetchError.message 
      }, { status: 500 })
    }

    if (!stuckPromptJobs || stuckPromptJobs.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        results: {
          ...results,
          message: 'No stuck prompt jobs found'
        }
      })
    }

    results.stuckProcessing = stuckPromptJobs.length

    console.log('[CleanupStuckPromptJobs] Found stuck processing jobs', {
      count: stuckPromptJobs.length,
      thresholdMinutes: 30
    })

    // Also check for stuck queued jobs (> 1 hour old)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const { data: stuckQueuedJobs } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, created_at, priority')
      .eq('status', 'queued')
      .lt('created_at', oneHourAgo)

    // Boost priority for stuck queued jobs (> 1 hour) and fail very old ones (> 24 hours)
    if (stuckQueuedJobs && stuckQueuedJobs.length > 0) {
      console.log('[CleanupStuckPromptJobs] Found stuck queued jobs', {
        count: stuckQueuedJobs.length
      })

      for (const job of stuckQueuedJobs) {
        const isVeryOld = new Date(job.created_at) < new Date(oneDayAgo)
        
        if (isVeryOld) {
          // Very old jobs (24+ hours) should be failed
          await supabase
            .rpc('update_prompt_job_status', {
              p_job_id: job.id,
              p_status: 'failed',
              p_error: 'timeout: stuck in queue for 24+ hours',
              p_generated_prompt: null
            })

          // Update dependent jobs
          const { data: dependentJobs } = await supabase
            .from('jobs')
            .select('id, row_id')
            .eq('prompt_job_id', job.id)
            .in('status', ['queued', 'submitted'])

          if (dependentJobs && dependentJobs.length > 0) {
            await supabase
              .from('jobs')
              .update({
                status: 'failed',
                prompt_status: 'failed',
                error: 'Prompt generation failed: stuck in queue for 24+ hours',
                updated_at: new Date().toISOString()
              })
              .eq('prompt_job_id', job.id)
              .in('status', ['queued', 'submitted'])
          }
        } else {
          // Boost priority for stuck queued jobs to ensure they get processed
          const newPriority = Math.min(10, (job.priority || 5) + 2)
          await supabase
            .from('prompt_generation_jobs')
            .update({
              priority: newPriority,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)
        }
      }
    }

    // Process each stuck processing job
    for (const job of stuckPromptJobs) {
      const shouldRetry = job.retry_count < job.max_retries

      if (shouldRetry) {
        // Reset to queued status for retry
        const { error: requeueError } = await supabase
          .from('prompt_generation_jobs')
          .update({
            status: 'queued',
            updated_at: new Date().toISOString(),
            started_at: null
          })
          .eq('id', job.id)

        if (requeueError) {
          console.error(`[CleanupStuckPromptJobs] Failed to requeue job ${job.id}:`, requeueError)
        } else {
          results.requeued++
          console.log(`[CleanupStuckPromptJobs] Requeued stuck prompt job`, { 
            jobId: job.id,
            retryCount: job.retry_count,
            maxRetries: job.max_retries
          })
        }
      } else {
        // Max retries exceeded, mark as failed
        const { error: failError } = await supabase
          .rpc('update_prompt_job_status', {
            p_job_id: job.id,
            p_status: 'failed',
            p_error: 'timeout: stuck in processing state',
            p_generated_prompt: null
          })

        if (failError) {
          console.error(`[CleanupStuckPromptJobs] Failed to mark job ${job.id} as failed:`, failError)
        } else {
          results.failed++
          console.log(`[CleanupStuckPromptJobs] Marked stuck prompt job as failed`, { 
            jobId: job.id,
            retryCount: job.retry_count,
            maxRetries: job.max_retries
          })

          // Update dependent jobs that are waiting for this prompt
          const { data: dependentJobs } = await supabase
            .from('jobs')
            .select('id, row_id')
            .eq('prompt_job_id', job.id)
            .in('status', ['queued', 'submitted'])

          if (dependentJobs && dependentJobs.length > 0) {
            await supabase
              .from('jobs')
              .update({
                status: 'failed',
                prompt_status: 'failed',
                error: 'Prompt generation failed: timeout',
                updated_at: new Date().toISOString()
              })
              .eq('prompt_job_id', job.id)
              .in('status', ['queued', 'submitted'])

            results.dependentJobsUpdated += dependentJobs.length
            console.log(`[CleanupStuckPromptJobs] Updated ${dependentJobs.length} dependent jobs for failed prompt job`, { 
              promptJobId: job.id 
            })

            // Update row statuses for affected rows
            const rowIds = [...new Set(dependentJobs.map(j => j.row_id))]
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
        }
      }
    }

    results.totalCleaned = results.requeued + results.failed

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    })

  } catch (error) {
    console.error('[CleanupStuckPromptJobs] Error:', error)
    return NextResponse.json({ 
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

