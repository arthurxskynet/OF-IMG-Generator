import { NextRequest, NextResponse } from 'next/server'
import { promptQueueService } from '@/lib/prompt-queue'

/**
 * POST /api/cron/prompt-processor - Background processor for prompt generation queue
 * This endpoint can be called by a cron job or triggered manually to process the queue
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[PromptProcessor] Starting prompt queue processing and cleanup')
    
    // Always run cleanup before starting processing to handle stuck jobs
    // This ensures items stuck for a day get handled even if processor was down
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    
    // Clean up stuck processing jobs (> 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // Clean up very old stuck processing jobs first (these are definitely stuck)
    const { data: veryOldProcessingJobs } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, started_at')
      .eq('status', 'processing')
      .lt('started_at', oneDayAgo)

    if (veryOldProcessingJobs && veryOldProcessingJobs.length > 0) {
      console.log('[PromptProcessor] Found very old stuck processing jobs (24+ hours)', {
        count: veryOldProcessingJobs.length
      })

      for (const job of veryOldProcessingJobs) {
        // These are definitely stuck, mark as failed regardless of retries
        await supabaseAdmin
          .rpc('update_prompt_job_status', {
            p_job_id: job.id,
            p_status: 'failed',
            p_error: 'timeout: stuck in processing state for 24+ hours',
            p_generated_prompt: null
          })

        // Update dependent jobs
        const { data: dependentJobs } = await supabaseAdmin
          .from('jobs')
          .select('id, row_id')
          .eq('prompt_job_id', job.id)
          .in('status', ['queued', 'submitted'])

        if (dependentJobs && dependentJobs.length > 0) {
          await supabaseAdmin
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
    }

    // Clean up very old queued jobs (24+ hours)
    const { data: veryOldQueuedJobs } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .select('id, row_id, retry_count, max_retries, created_at')
      .eq('status', 'queued')
      .lt('created_at', oneDayAgo)

    if (veryOldQueuedJobs && veryOldQueuedJobs.length > 0) {
      console.log('[PromptProcessor] Found very old queued jobs (24+ hours)', {
        count: veryOldQueuedJobs.length
      })

      for (const job of veryOldQueuedJobs) {
        await supabaseAdmin
          .rpc('update_prompt_job_status', {
            p_job_id: job.id,
            p_status: 'failed',
            p_error: 'timeout: stuck in queue for 24+ hours',
            p_generated_prompt: null
          })

        // Update dependent jobs
        const { data: dependentJobs } = await supabaseAdmin
          .from('jobs')
          .select('id, row_id')
          .eq('prompt_job_id', job.id)
          .in('status', ['queued', 'submitted'])

        if (dependentJobs && dependentJobs.length > 0) {
          await supabaseAdmin
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
      }
    }
    
    // Start the processing service if not already running
    promptQueueService.startProcessing()
    
    // Get current queue stats
    const stats = await promptQueueService.getQueueStats()
    
    console.log('[PromptProcessor] Queue stats after cleanup:', stats)
    
    return NextResponse.json({
      success: true,
      message: 'Prompt queue processing started',
      stats,
      cleanup: {
        veryOldProcessingJobs: veryOldProcessingJobs?.length || 0,
        veryOldQueuedJobs: veryOldQueuedJobs?.length || 0
      }
    })

  } catch (error) {
    console.error('[PromptProcessor] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * GET /api/cron/prompt-processor - Get queue status and statistics
 */
export async function GET(req: NextRequest) {
  try {
    const stats = await promptQueueService.getQueueStats()
    
    return NextResponse.json({
      success: true,
      stats
    })

  } catch (error) {
    console.error('[PromptProcessor] Error getting stats:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
