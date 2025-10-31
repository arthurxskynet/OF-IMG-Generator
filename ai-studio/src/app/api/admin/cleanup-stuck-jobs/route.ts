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
      stuckPromptProcessing: 0,
      stuckPromptRequeued: 0,
      stuckPromptFailed: 0,
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

    // Clean up stuck prompt generation jobs in 'processing' state (> 30 minutes old)
    // This handles cases where API calls take longer or worker crashes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // First handle very old stuck processing jobs (24+ hours) - these are definitely stuck
    const { data: veryOldProcessingJobs } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, started_at')
      .eq('status', 'processing')
      .lt('started_at', oneDayAgo)

    if (veryOldProcessingJobs && veryOldProcessingJobs.length > 0) {
      for (const job of veryOldProcessingJobs) {
        // These are definitely stuck, mark as failed regardless of retries
        await supabase
          .rpc('update_prompt_job_status', {
            p_job_id: job.id,
            p_status: 'failed',
            p_error: 'manual cleanup: stuck in processing state for 24+ hours',
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
              error: 'Prompt generation failed: stuck in processing for 24+ hours',
              updated_at: new Date().toISOString()
            })
            .eq('prompt_job_id', job.id)
            .in('status', ['queued', 'submitted'])
        }
      }
      
      results.stuckPromptProcessing += veryOldProcessingJobs.length
      results.stuckPromptFailed += veryOldProcessingJobs.length
    }
    
    // Then handle moderately stuck processing jobs (30 minutes - 24 hours)
    const { data: stuckPromptJobs } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, started_at')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinAgo)
      .gte('started_at', oneDayAgo) // Only get jobs between 30 min and 24 hours

    if (stuckPromptJobs && stuckPromptJobs.length > 0) {
      results.stuckPromptProcessing += stuckPromptJobs.length

      // Also check for stuck queued jobs (> 1 hour old)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: stuckQueuedJobs } = await supabase
        .from('prompt_generation_jobs')
        .select('id, row_id, retry_count, max_retries, created_at, priority')
        .eq('status', 'queued')
        .lt('created_at', oneHourAgo)

      // Boost priority for stuck queued jobs (> 1 hour) and fail very old ones (> 24 hours)
      if (stuckQueuedJobs && stuckQueuedJobs.length > 0) {
        for (const job of stuckQueuedJobs) {
          const isVeryOld = new Date(job.created_at) < new Date(oneDayAgo)
          
          if (isVeryOld) {
            // Very old jobs (24+ hours) should be failed
            await supabase
              .rpc('update_prompt_job_status', {
                p_job_id: job.id,
                p_status: 'failed',
                p_error: 'manual cleanup: stuck in queue for 24+ hours',
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

            results.stuckPromptFailed++
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

            results.stuckPromptRequeued++
          }
        }
      }

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

          if (!requeueError) {
            results.stuckPromptRequeued++
          }
        } else {
          // Max retries exceeded, mark as failed
          const { error: failError } = await supabase
            .rpc('update_prompt_job_status', {
              p_job_id: job.id,
              p_status: 'failed',
              p_error: 'manual cleanup: stuck in processing state',
              p_generated_prompt: null
            })

          if (!failError) {
            results.stuckPromptFailed++

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
            }
          }
        }
      }
    }

    results.totalCleaned = results.stuckQueued + results.stuckSaving + results.stuckRunning + results.stuckPromptRequeued + results.stuckPromptFailed

    // Update row statuses for affected rows
    if (results.totalCleaned > 0) {
      const allAffectedJobs = [
        ...(stuckQueuedJobs || []),
        ...(stuckSavingJobs || []),
        ...(stuckRunningJobs || [])
      ]
      
      // Add prompt job row_ids if any were failed
      if (stuckPromptJobs && stuckPromptJobs.length > 0) {
        const failedPromptJobs = stuckPromptJobs.filter(j => j.retry_count >= j.max_retries)
        if (failedPromptJobs.length > 0) {
          // Get dependent jobs for failed prompt jobs
          for (const promptJob of failedPromptJobs) {
            const { data: dependentJobs } = await supabase
              .from('jobs')
              .select('id, row_id')
              .eq('prompt_job_id', promptJob.id)
              
            if (dependentJobs) {
              allAffectedJobs.push(...dependentJobs)
            }
            // Also include the prompt job's row_id directly
            allAffectedJobs.push({ id: promptJob.id, row_id: promptJob.row_id })
          }
        }
      }
      
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