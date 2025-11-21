import { supabaseAdmin } from '@/lib/supabase-admin'
import { generatePromptWithGrok, enhancePromptWithGrok, SwapMode } from '@/lib/ai-prompt-generator'
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
   * Add a prompt enhancement request to the queue
   */
  async enqueuePromptEnhancement(
    rowId: string,
    modelId: string,
    userId: string,
    existingPrompt: string,
    userInstructions: string,
    refUrls: string[],
    targetUrl: string,
    priority: number = 8,
    swapMode: SwapMode = 'face-hair'
  ): Promise<string> {
    // Build insert object
    const insertData: any = {
      row_id: rowId,
      model_id: modelId,
      user_id: userId,
      ref_urls: refUrls.length > 0 ? refUrls : null,
      target_url: targetUrl,
      existing_prompt: existingPrompt,
      user_instructions: userInstructions,
      priority,
      status: 'queued',
      operation: 'enhance',
      swap_mode: swapMode
    }
    
    let { data, error } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .insert(insertData)
      .select('id')
      .single()

    // If error is due to missing columns, log warning (should handle via migration)
    if (error) {
      console.error('[PromptQueue] Failed to enqueue prompt enhancement:', error)
      throw new Error(`Failed to enqueue prompt enhancement: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to enqueue prompt enhancement: No data returned')
    }

    console.log('[PromptQueue] Enqueued prompt enhancement', { 
      promptJobId: data.id, 
      rowId, 
      priority,
      swapMode
    })

    // Trigger processing if not already running
    this.startProcessing()

    return data.id
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
    priority: number = 5,
    swapMode: SwapMode = 'face-hair'
  ): Promise<string> {
    // Build insert object - swap_mode is optional and will be ignored if column doesn't exist
    const insertData: any = {
      row_id: rowId,
      model_id: modelId,
      user_id: userId,
      ref_urls: refUrls.length > 0 ? refUrls : null,
      target_url: targetUrl,
      priority,
      status: 'queued'
    }
    
    // Add swap_mode if column exists (will be ignored by database if column doesn't exist)
    // Note: To enable swap_mode, run: ALTER TABLE prompt_generation_jobs ADD COLUMN IF NOT EXISTS swap_mode text DEFAULT 'face-hair';
    insertData.swap_mode = swapMode
    
    let { data, error } = await supabaseAdmin
      .from('prompt_generation_jobs')
      .insert(insertData)
      .select('id')
      .single()

    // If error is due to missing swap_mode column, retry without it
    if (error && error.message && error.message.includes('swap_mode')) {
      console.warn('[PromptQueue] swap_mode column not found, retrying without swap_mode. Add column with: ALTER TABLE prompt_generation_jobs ADD COLUMN IF NOT EXISTS swap_mode text DEFAULT \'face-hair\';')
      const insertDataWithoutSwapMode = { ...insertData }
      delete insertDataWithoutSwapMode.swap_mode
      
      const retryResult = await supabaseAdmin
        .from('prompt_generation_jobs')
        .insert(insertDataWithoutSwapMode)
        .select('id')
        .single()
      
      data = retryResult.data
      error = retryResult.error
    }

    if (error) {
      console.error('[PromptQueue] Failed to enqueue prompt generation:', error)
      throw new Error(`Failed to enqueue prompt generation: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to enqueue prompt generation: No data returned')
    }

    console.log('[PromptQueue] Enqueued prompt generation', { 
      promptJobId: data.id, 
      rowId, 
      priority,
      swapMode
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
   * Detect and recover stuck processing jobs
   * Finds prompt jobs stuck in 'processing' state and either requeues them or marks as failed
   */
  private async recoverStuckProcessingJobs(): Promise<void> {
    try {
      // Find prompt jobs stuck in 'processing' state (> 30 minutes old)
      // This handles cases where API calls take longer or worker crashes
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      
      const { data: stuckJobs, error } = await supabaseAdmin
        .from('prompt_generation_jobs')
        .select('id, row_id, retry_count, max_retries, started_at')
        .eq('status', 'processing')
        .lt('started_at', thirtyMinAgo)

      if (error) {
        console.error('[PromptQueue] Failed to fetch stuck jobs:', error)
        return
      }

      if (!stuckJobs || stuckJobs.length === 0) {
        return // No stuck jobs
      }

      console.log('[PromptQueue] Found stuck processing jobs', { 
        count: stuckJobs.length,
        thresholdMinutes: 30
      })

      // Process each stuck job
      for (const job of stuckJobs) {
        const shouldRetry = job.retry_count < job.max_retries

        if (shouldRetry) {
          // Reset to queued status for retry
          const { error: requeueError } = await supabaseAdmin
            .from('prompt_generation_jobs')
            .update({
              status: 'queued',
              updated_at: new Date().toISOString(),
              started_at: null
            })
            .eq('id', job.id)

          if (requeueError) {
            console.error(`[PromptQueue] Failed to requeue stuck job ${job.id}:`, requeueError)
          } else {
            console.log(`[PromptQueue] Requeued stuck prompt job`, { 
              jobId: job.id,
              retryCount: job.retry_count,
              maxRetries: job.max_retries
            })
          }
        } else {
          // Max retries exceeded, mark as failed
          const { error: failError } = await supabaseAdmin
            .rpc('update_prompt_job_status', {
              p_job_id: job.id,
              p_status: 'failed',
              p_error: 'timeout: stuck in processing state',
              p_generated_prompt: null
            })

          if (failError) {
            console.error(`[PromptQueue] Failed to mark stuck job ${job.id} as failed:`, failError)
          } else {
            console.log(`[PromptQueue] Marked stuck prompt job as failed`, { 
              jobId: job.id,
              retryCount: job.retry_count,
              maxRetries: job.max_retries
            })

            // Update dependent jobs
            await this.updateDependentJobs(job.id, null, 'Prompt generation failed: timeout')
          }
        }
      }
    } catch (error) {
      console.error('[PromptQueue] Error recovering stuck jobs:', error)
    }
  }

  /**
   * Detect and recover stuck queued jobs
   * Finds prompt jobs stuck in 'queued' state for extended periods and ensures they get processed
   */
  private async recoverStuckQueuedJobs(): Promise<void> {
    try {
      // Find prompt jobs stuck in 'queued' state (> 1 hour old)
      // These are jobs that should have been processed but weren't claimed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      
      const { data: stuckQueuedJobs, error } = await supabaseAdmin
        .from('prompt_generation_jobs')
        .select('id, row_id, retry_count, max_retries, created_at, priority')
        .eq('status', 'queued')
        .lt('created_at', oneHourAgo)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50) // Process in batches to avoid overload

      if (error) {
        console.error('[PromptQueue] Failed to fetch stuck queued jobs:', error)
        return
      }

      if (!stuckQueuedJobs || stuckQueuedJobs.length === 0) {
        return // No stuck queued jobs
      }

      console.log('[PromptQueue] Found stuck queued jobs', { 
        count: stuckQueuedJobs.length,
        thresholdHours: 1
      })

      // Boost priority of old queued jobs to ensure they get processed
      // This helps items that have been waiting for a day
      for (const job of stuckQueuedJobs) {
        const newPriority = Math.min(10, (job.priority || 5) + 2)
        
        const { error: updateError } = await supabaseAdmin
          .from('prompt_generation_jobs')
          .update({
            priority: newPriority,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        if (updateError) {
          console.error(`[PromptQueue] Failed to boost priority for stuck queued job ${job.id}:`, updateError)
        } else {
          console.log(`[PromptQueue] Boosted priority for stuck queued job`, { 
            jobId: job.id,
            oldPriority: job.priority,
            newPriority
          })
        }
      }

      // For very old jobs (24+ hours), check if they should be failed
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      
      const { data: veryOldJobs } = await supabaseAdmin
        .from('prompt_generation_jobs')
        .select('id, row_id, retry_count, max_retries, created_at')
        .eq('status', 'queued')
        .lt('created_at', oneDayAgo)

      if (veryOldJobs && veryOldJobs.length > 0) {
        console.log('[PromptQueue] Found very old queued jobs (24+ hours)', { 
          count: veryOldJobs.length 
        })

        for (const job of veryOldJobs) {
          // If retries exceeded or no progress in 24 hours, mark as failed
          await supabaseAdmin
            .rpc('update_prompt_job_status', {
              p_job_id: job.id,
              p_status: 'failed',
              p_error: 'timeout: stuck in queue for 24+ hours',
              p_generated_prompt: null
            })

          // Update dependent jobs
          await this.updateDependentJobs(job.id, null, 'Prompt generation failed: stuck in queue for 24+ hours')
          
          console.log('[PromptQueue] Marked very old queued job as failed', { 
            jobId: job.id,
            ageHours: Math.round((Date.now() - new Date(job.created_at).getTime()) / (60 * 60 * 1000))
          })
        }
      }
    } catch (error) {
      console.error('[PromptQueue] Error recovering stuck queued jobs:', error)
    }
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
        // First, recover any stuck jobs (both processing and queued)
        await Promise.all([
          this.recoverStuckProcessingJobs(),
          this.recoverStuckQueuedJobs()
        ])

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
    const { id: jobId, ref_urls, target_url, retry_count, max_retries, swap_mode, operation, existing_prompt, user_instructions } = job

    try {
      // Default to 'face-hair' if swap_mode not specified
      const swapMode: SwapMode = (swap_mode || 'face-hair') as SwapMode
      
      console.log('[PromptQueue] Processing job', { 
        jobId, 
        retryCount: retry_count,
        hasRefs: Boolean(ref_urls?.length),
        swapMode,
        operation: operation || 'generate'
      })

      // Set a timeout of 25 minutes to ensure we don't exceed the 30-minute threshold
      const timeoutMs = 25 * 60 * 1000 // 25 minutes
      
      let generatedPrompt: string

      if (operation === 'enhance') {
        if (!existing_prompt || !user_instructions) {
          throw new Error('Missing inputs for enhancement job')
        }
        
        generatedPrompt = await Promise.race([
          enhancePromptWithGrok(existing_prompt, user_instructions, ref_urls || [], target_url, swapMode),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Prompt enhancement timeout after 25 minutes')), timeoutMs)
          )
        ])
      } else {
        // Default to generation
        generatedPrompt = await Promise.race([
          generatePromptWithGrok(ref_urls || [], target_url, swapMode),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Prompt generation timeout after 25 minutes')), timeoutMs)
          )
        ])
      }

      // Update job as completed
      await supabaseAdmin
        .rpc('update_prompt_job_status', {
          p_job_id: jobId,
          p_status: 'completed',
          p_generated_prompt: generatedPrompt
        })

      // Update any waiting jobs that depend on this prompt
      // Note: Enhance jobs might not have dependent jobs, but it doesn't hurt to check
      await this.updateDependentJobs(jobId, generatedPrompt)

      console.log('[PromptQueue] Job completed', { 
        jobId, 
        promptLength: generatedPrompt.length,
        operation: operation || 'generate'
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isTimeout = errorMessage.includes('timeout')
      const isNetworkError = errorMessage.includes('ECONNRESET') || 
                              errorMessage.includes('ETIMEDOUT') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('fetch')
      
      console.error('[PromptQueue] Job failed', { 
        jobId, 
        error: errorMessage,
        isTimeout,
        isNetworkError,
        retryCount: retry_count
      })

      const shouldRetry = retry_count < max_retries
      const newRetryCount = retry_count + 1

      if (shouldRetry) {
        // Calculate delay with exponential backoff
        // For network errors or timeouts, use shorter delay to retry faster
        const baseDelay = isTimeout || isNetworkError 
          ? this.retryConfig.baseDelayMs * 0.5 // Faster retry for transient errors
          : this.retryConfig.baseDelayMs
        
        const delayMs = Math.min(
          baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retry_count),
          this.retryConfig.maxDelayMs
        )

        console.log('[PromptQueue] Retrying job', { 
          jobId, 
          retryCount: newRetryCount, 
          delayMs,
          errorType: isTimeout ? 'timeout' : isNetworkError ? 'network' : 'other'
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
