import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = "nodejs"

/**
 * Reset endpoint for all stuck items in queue
 * This aggressively resets ALL stuck jobs found, regardless of age
 * Use this to reset everything that's currently stuck
 */
export async function POST(req: NextRequest) {
  try {
    // Admin secret is optional - if set, require it; otherwise allow unauthenticated
    // WARNING: Without admin secret, this endpoint is publicly accessible
    const authHeader = req.headers.get('authorization')
    const adminSecret = process.env.ADMIN_SECRET
    
    if (adminSecret) {
      if (authHeader !== `Bearer ${adminSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } else {
      console.warn('[ResetStuckQueue] WARNING: Running without admin secret - endpoint is publicly accessible')
    }

    const supabase = supabaseAdmin
    const results = {
      promptProcessingReset: 0,
      promptQueuedReset: 0,
      promptFailed: 0,
      jobsQueuedReset: 0,
      jobsRunningReset: 0,
      jobsSavingReset: 0,
      jobsSubmittedReset: 0,
      jobsFailed: 0,
      dependentJobsUpdated: 0,
      rowStatusesUpdated: 0
    }

    console.log('[ResetStuckQueue] Starting comprehensive queue reset')

    // ============================================
    // 1. RESET ALL STUCK PROMPT GENERATION JOBS
    // ============================================

    // Reset all processing prompt jobs (any age - full reset)
    const { data: allProcessingPromptJobs } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, started_at')
      .eq('status', 'processing')

    if (allProcessingPromptJobs && allProcessingPromptJobs.length > 0) {
      console.log('[ResetStuckQueue] Found processing prompt jobs to reset', {
        count: allProcessingPromptJobs.length
      })

      for (const job of allProcessingPromptJobs) {
        const shouldRetry = job.retry_count < job.max_retries

        if (shouldRetry) {
          // Reset to queued for retry
          const { error: resetError } = await supabase
            .from('prompt_generation_jobs')
            .update({
              status: 'queued',
              started_at: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)

          if (!resetError) {
            results.promptProcessingReset++
            console.log(`[ResetStuckQueue] Reset processing prompt job to queued`, {
              jobId: job.id,
              retryCount: job.retry_count
            })
          }
        } else {
          // Max retries exceeded, mark as failed
          const { error: failError } = await supabase
            .rpc('update_prompt_job_status', {
              p_job_id: job.id,
              p_status: 'failed',
              p_error: 'reset: max retries exceeded',
              p_generated_prompt: null
            })

          if (!failError) {
            results.promptFailed++
            
            // Update dependent jobs
            const { data: dependentJobs } = await supabase
              .from('jobs')
              .select('id, row_id')
              .eq('prompt_job_id', job.id)
              .in('status', ['queued', 'submitted', 'running'])

            if (dependentJobs && dependentJobs.length > 0) {
              await supabase
                .from('jobs')
                .update({
                  status: 'failed',
                  prompt_status: 'failed',
                  error: 'Prompt generation failed: max retries exceeded',
                  updated_at: new Date().toISOString()
                })
                .eq('prompt_job_id', job.id)
                .in('status', ['queued', 'submitted', 'running'])

              results.dependentJobsUpdated += dependentJobs.length
            }

            console.log(`[ResetStuckQueue] Marked processing prompt job as failed`, {
              jobId: job.id
            })
          }
        }
      }
    }

    // Reset all stuck queued prompt jobs (boost priority and ensure they're ready)
    const { data: allQueuedPromptJobs } = await supabase
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, created_at, priority')
      .eq('status', 'queued')

    if (allQueuedPromptJobs && allQueuedPromptJobs.length > 0) {
      console.log('[ResetStuckQueue] Found queued prompt jobs to boost', {
        count: allQueuedPromptJobs.length
      })

      for (const job of allQueuedPromptJobs) {
        // Boost priority to ensure processing
        const newPriority = Math.min(10, (job.priority || 5) + 2)
        
        const { error: updateError } = await supabase
          .from('prompt_generation_jobs')
          .update({
            priority: newPriority,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        if (!updateError) {
          results.promptQueuedReset++
          console.log(`[ResetStuckQueue] Boosted priority for queued prompt job`, {
            jobId: job.id,
            oldPriority: job.priority,
            newPriority
          })
        }
      }
    }

    // ============================================
    // 2. RESET ALL STUCK REGULAR JOBS
    // ============================================

    // Reset stuck queued jobs (no age limit - full reset)
    const { data: allQueuedJobs } = await supabase
      .from('jobs')
      .select('id, row_id, status, created_at')
      .eq('status', 'queued')

    if (allQueuedJobs && allQueuedJobs.length > 0) {
      console.log('[ResetStuckQueue] Found queued jobs to reset', {
        count: allQueuedJobs.length
      })

      // For very old queued jobs (> 1 hour), mark as failed
      // For newer ones, they can stay queued (they're legitimately queued)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      
      for (const job of allQueuedJobs) {
        const jobAge = new Date(job.created_at)
        const isOld = jobAge < oneHourAgo

        if (isOld) {
          // Old stuck queued jobs should be failed
          await supabase
            .from('jobs')
            .update({
              status: 'failed',
              error: 'reset: stuck in queue for 1+ hours',
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)

          results.jobsFailed++
          console.log(`[ResetStuckQueue] Marked old queued job as failed`, {
            jobId: job.id,
            ageHours: Math.round((Date.now() - jobAge.getTime()) / (60 * 60 * 1000))
          })
        } else {
          // Keep them queued but update timestamp
          await supabase
            .from('jobs')
            .update({
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)

          results.jobsQueuedReset++
        }
      }
    }

    // Reset stuck running jobs (no provider ID or very old)
    const { data: stuckRunningJobs } = await supabase
      .from('jobs')
      .select('id, row_id, status, updated_at, provider_request_id')
      .eq('status', 'running')
      .is('provider_request_id', null)

    if (stuckRunningJobs && stuckRunningJobs.length > 0) {
      console.log('[ResetStuckQueue] Found stuck running jobs', {
        count: stuckRunningJobs.length
      })

      for (const job of stuckRunningJobs) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: 'reset: stuck running without provider ID',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        results.jobsRunningReset++
      }
    }

    // Reset stuck saving jobs (no provider ID)
    const { data: stuckSavingJobs } = await supabase
      .from('jobs')
      .select('id, row_id, status, updated_at, provider_request_id')
      .eq('status', 'saving')
      .is('provider_request_id', null)

    if (stuckSavingJobs && stuckSavingJobs.length > 0) {
      console.log('[ResetStuckQueue] Found stuck saving jobs', {
        count: stuckSavingJobs.length
      })

      for (const job of stuckSavingJobs) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: 'reset: stuck saving without provider ID',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        results.jobsSavingReset++
      }
    }

    // Reset stuck submitted jobs (very old - > 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: stuckSubmittedJobs } = await supabase
      .from('jobs')
      .select('id, row_id, status, updated_at')
      .eq('status', 'submitted')
      .lt('updated_at', twoHoursAgo)

    if (stuckSubmittedJobs && stuckSubmittedJobs.length > 0) {
      console.log('[ResetStuckQueue] Found stuck submitted jobs', {
        count: stuckSubmittedJobs.length
      })

      for (const job of stuckSubmittedJobs) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: 'reset: stuck in submitted state for 2+ hours',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        results.jobsSubmittedReset++
      }
    }

    // ============================================
    // 3. UPDATE ROW STATUSES
    // ============================================

    // Update row statuses for all affected rows
    const allAffectedRowIds = new Set<string>()

    // Collect row IDs from all affected jobs
    if (allProcessingPromptJobs) {
      allProcessingPromptJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }
    if (allQueuedPromptJobs) {
      allQueuedPromptJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }
    if (allQueuedJobs) {
      allQueuedJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }
    if (stuckRunningJobs) {
      stuckRunningJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }
    if (stuckSavingJobs) {
      stuckSavingJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }
    if (stuckSubmittedJobs) {
      stuckSubmittedJobs.forEach(j => allAffectedRowIds.add(j.row_id))
    }

    // Update each affected row's status
    for (const rowId of allAffectedRowIds) {
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

      results.rowStatusesUpdated++
    }

    // Calculate totals
    const totalPromptJobsReset = results.promptProcessingReset + results.promptQueuedReset + results.promptFailed
    const totalJobsReset = results.jobsQueuedReset + results.jobsRunningReset + results.jobsSavingReset + results.jobsSubmittedReset + results.jobsFailed
    const totalReset = totalPromptJobsReset + totalJobsReset

    console.log('[ResetStuckQueue] Queue reset complete', {
      totalReset,
      results
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalItemsReset: totalReset,
        promptJobs: {
          processingReset: results.promptProcessingReset,
          queuedReset: results.promptQueuedReset,
          failed: results.promptFailed,
          total: totalPromptJobsReset
        },
        regularJobs: {
          queuedReset: results.jobsQueuedReset,
          runningReset: results.jobsRunningReset,
          savingReset: results.jobsSavingReset,
          submittedReset: results.jobsSubmittedReset,
          failed: results.jobsFailed,
          total: totalJobsReset
        },
        dependentJobsUpdated: results.dependentJobsUpdated,
        rowStatusesUpdated: results.rowStatusesUpdated
      },
      results
    })

  } catch (error) {
    console.error('[ResetStuckQueue] Error:', error)
    return NextResponse.json({ 
      error: 'Reset failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
