import { supabaseAdmin } from '@/lib/supabase-admin'
import { generatePromptWithGrok } from '@/lib/ai-prompt-generator'
import { 
  PromptGenerationJob, 
  PromptQueueStats, 
  PromptRetryConfig, 
  DEFAULT_RETRY_CONFIG 
} from '@/types/prompt-queue'

export class PromptQueueService {
  private static instance: PromptQueueService
  private isProcessing = false
  private processingInterval: NodeJS.Timeout | null = null
  private currentRun: Promise<void> | null = null
  private readonly batchSize = 3
  private readonly retryConfig: PromptRetryConfig

  constructor(retryConfig: PromptRetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig
  }

  static getInstance(): PromptQueueService {
    if (!PromptQueueService.instance) {
      PromptQueueService.instance = new PromptQueueService()
    }
    return PromptQueueService.instance
  }

  /**
   * Add a prompt generation request to the queue
   */
  async enqueuePromptGeneration(
    rowId: string,
    modelId: string,
    userId: string,
    refUrls: string[],
    targetUrl: string,
    priority: number = 5
  ): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .insert({
        row_id: rowId,
        model_id: modelId,
        user_id: userId,
        ref_urls: refUrls.length > 0 ? refUrls : null,
        target_url: targetUrl,
        priority,
        status: 'queued'
      })
      .select('id')
      .single()

    if (error) {
      console.error('[PromptQueue] Failed to enqueue prompt generation:', error)
      throw new Error(`Failed to enqueue prompt generation: ${error.message}`)
    }

    console.log('[PromptQueue] Enqueued prompt generation', { 
      promptJobId: data.id, 
      rowId, 
      priority 
    })

    // Trigger processing if not already running
    this.startProcessing()

    return data.id
  }

  /**
   * Start the background processing loop
   */
  startProcessing(): void {
    if (this.isProcessing) return

    this.isProcessing = true
    console.log('[PromptQueue] Starting background processing')

    // Process immediately, then every 5 seconds
    void this.processQueue()
    this.processingInterval = setInterval(() => {
      void this.processQueue()
    }, 5000)
  }

  /**
   * Stop the background processing loop
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    this.isProcessing = false
    console.log('[PromptQueue] Stopped background processing')
  }

  /**
   * Process queued prompt generation jobs
   */
  private async processQueue(): Promise<void> {
    if (this.currentRun) {
      return this.currentRun
    }

    let run: Promise<void> | null = null

    const runPromise = (async () => {
      try {
        while (true) {
          // Claim up to the batch size at a time (adjust based on API rate limits)
          const { data: claimedJobs, error } = await supabaseAdmin
            .rpc('claim_prompt_jobs', { p_limit: this.batchSize })

          if (error) {
            console.error('[PromptQueue] Failed to claim jobs:', error)
            return
          }

          if (!claimedJobs || claimedJobs.length === 0) {
            return // No jobs to process
          }

          console.log('[PromptQueue] Processing jobs', { count: claimedJobs.length })

          // Process jobs in parallel within the batch
          await Promise.allSettled(
            claimedJobs.map((job: PromptGenerationJob) => this.processPromptJob(job))
          )

          if (claimedJobs.length < this.batchSize) {
            return // Nothing left to claim in this run
          }
        }
      } catch (error) {
        console.error('[PromptQueue] Error in processQueue:', error)
      } finally {
        if (this.currentRun === run) {
          this.currentRun = null
        }
      }
    })()

    run = runPromise
    this.currentRun = runPromise

    return runPromise
  }

  /**
   * Process a single prompt generation job
   */
  private async processPromptJob(job: PromptGenerationJob): Promise<void> {
    const { id: jobId, ref_urls, target_url, retry_count, max_retries } = job

    try {
      console.log('[PromptQueue] Processing job', { 
        jobId, 
        retryCount: retry_count,
        hasRefs: Boolean(ref_urls?.length) 
      })

      // Generate prompt using Grok
      const generatedPrompt = await generatePromptWithGrok(
        ref_urls || [], 
        target_url
      )

      // Update job as completed
      await supabaseAdmin
        .rpc('update_prompt_job_status', {
          p_job_id: jobId,
          p_status: 'completed',
          p_generated_prompt: generatedPrompt
        })

      // Update any waiting jobs that depend on this prompt
      await this.updateDependentJobs(jobId, generatedPrompt)

      console.log('[PromptQueue] Job completed', { 
        jobId, 
        promptLength: generatedPrompt.length 
      })

    } catch (error) {
      console.error('[PromptQueue] Job failed', { 
        jobId, 
        error: error instanceof Error ? error.message : error 
      })

      const shouldRetry = retry_count < max_retries
      const newRetryCount = retry_count + 1

      if (shouldRetry) {
        // Calculate delay with exponential backoff
        const delayMs = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, retry_count),
          this.retryConfig.maxDelayMs
        )

        console.log('[PromptQueue] Retrying job', { 
          jobId, 
          retryCount: newRetryCount, 
          delayMs 
        })

        // Reset to queued status for retry
        await supabaseAdmin
          .from('prompt_generation_jobs')
          .update({
            status: 'queued',
            retry_count: newRetryCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId)

        // Schedule retry with delay
        setTimeout(() => {
          void this.processQueue()
        }, delayMs)

      } else {
        // Max retries exceeded, mark as failed
        await supabaseAdmin
          .rpc('update_prompt_job_status', {
            p_job_id: jobId,
            p_status: 'failed',
            p_error: error instanceof Error ? error.message : 'Unknown error'
          })

        // Update dependent jobs to failed
        await this.updateDependentJobs(jobId, null, error instanceof Error ? error.message : 'Prompt generation failed')
      }
    }
  }

  /**
   * Update jobs that are waiting for this prompt generation to complete
   */
  private async updateDependentJobs(
    promptJobId: string, 
    generatedPrompt: string | null, 
    error?: string
  ): Promise<void> {
    const { data: dependentJobs, error: fetchError } = await supabaseAdmin
      .from('jobs')
      .select('id, status, prompt_status')
      .eq('prompt_job_id', promptJobId)
      .in('status', ['queued', 'submitted'])

    if (fetchError) {
      console.error('[PromptQueue] Failed to fetch dependent jobs:', fetchError)
      return
    }

    if (!dependentJobs || dependentJobs.length === 0) {
      return
    }

    console.log('[PromptQueue] Updating dependent jobs', { 
      promptJobId, 
      count: dependentJobs.length 
    })

    for (const job of dependentJobs) {
      if (generatedPrompt) {
        // Get current request payload to update it
        const { data: currentJob } = await supabaseAdmin
          .from('jobs')
          .select('request_payload')
          .eq('id', job.id)
          .single()

        if (currentJob) {
          // Update job with generated prompt and mark prompt as completed
          await supabaseAdmin
            .from('jobs')
            .update({
              prompt_status: 'completed',
              request_payload: {
                ...currentJob.request_payload,
                prompt: generatedPrompt
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)

          console.log('[PromptQueue] Updated job with prompt', { jobId: job.id })
        }
      } else {
        // Mark job as failed due to prompt generation failure
        await supabaseAdmin
          .from('jobs')
          .update({
            status: 'failed',
            prompt_status: 'failed',
            error: error || 'Prompt generation failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        console.log('[PromptQueue] Marked job as failed', { jobId: job.id })
      }
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<PromptQueueStats> {
    const { data, error } = await supabaseAdmin
      .rpc('get_prompt_queue_stats')

    if (error) {
      console.error('[PromptQueue] Failed to get queue stats:', error)
      throw new Error(`Failed to get queue stats: ${error.message}`)
    }

    const stats = data?.[0]
    if (!stats) {
      throw new Error('No queue stats returned')
    }

    return {
      totalQueued: Number(stats.total_queued),
      totalProcessing: Number(stats.total_processing),
      totalCompleted: Number(stats.total_completed),
      totalFailed: Number(stats.total_failed),
      averageWaitTime: Number(stats.avg_wait_time_seconds),
      estimatedWaitTime: this.calculateEstimatedWaitTime(stats)
    }
  }

  /**
   * Calculate estimated wait time based on queue length and processing rate
   */
  private calculateEstimatedWaitTime(stats: any): number {
    const queued = Number(stats.total_queued)
    const processing = Number(stats.total_processing)
    const avgWaitTime = Number(stats.avg_wait_time_seconds)

    if (queued === 0) return 0

    // Estimate based on current queue length and average processing time
    const estimatedProcessingTime = avgWaitTime || 30 // Default 30 seconds if no history
    const totalActive = queued + processing
    const processingRate = this.batchSize // Jobs processed per batch, every 5 seconds = 36 jobs/minute when batch size is 3

    return Math.ceil((totalActive / processingRate) * 60) // Convert to seconds
  }

  /**
   * Get prompt generation status for a specific job
   */
  async getPromptStatus(promptJobId: string): Promise<PromptGenerationJob | null> {
    const { data, error } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .select('*')
      .eq('id', promptJobId)
      .single()

    if (error) {
      console.error('[PromptQueue] Failed to get prompt status:', error)
      return null
    }

    return data
  }

  /**
   * Cancel a prompt generation job
   */
  async cancelPromptJob(promptJobId: string): Promise<void> {
    await supabaseAdmin
      .rpc('update_prompt_job_status', {
        p_job_id: promptJobId,
        p_status: 'failed',
        p_error: 'Cancelled by user'
      })

    // Update dependent jobs
    await this.updateDependentJobs(promptJobId, null, 'Prompt generation cancelled')
  }
}

// Export singleton instance
export const promptQueueService = PromptQueueService.getInstance()
