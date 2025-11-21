import { z } from 'zod'

// Prompt generation queue schemas
export const PromptQueueRequestSchema = z.object({
  rowId: z.string().uuid(),
  refUrls: z.array(z.string()).optional(),
  targetUrl: z.string(),
  priority: z.number().min(1).max(10).default(5), // Higher number = higher priority
  swapMode: z.enum(['face', 'face-hair']).optional().default('face-hair')
})

export const PromptQueueResponseSchema = z.object({
  promptJobId: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  estimatedWaitTime: z.number().optional() // seconds
})

// Prompt enhancement queue schema
export const PromptEnhanceQueueRequestSchema = z.object({
  rowId: z.string().uuid(),
  existingPrompt: z.string().min(1),
  userInstructions: z.string().min(1),
  swapMode: z.enum(['face', 'face-hair']).optional().default('face-hair'),
  priority: z.number().min(1).max(10).default(8) // High priority by default for interactive edits
})

// Database types for prompt generation queue
export interface PromptGenerationJob {
  id: string
  row_id: string
  model_id: string
  user_id: string
  ref_urls?: string[]
  target_url: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  generated_prompt?: string
  error?: string
  retry_count: number
  max_retries: number
  priority: number
  swap_mode?: 'face' | 'face-hair' // Optional - defaults to 'face-hair' if not present
  operation?: 'generate' | 'enhance' // Default 'generate'
  existing_prompt?: string
  user_instructions?: string
  enhanced_prompt?: string
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  options?: { preserveComposition?: boolean } // Optional runtime-only; may not exist in DB
}

// Extended job types to include prompt generation status
export interface JobWithPromptStatus {
  id: string
  row_id: string
  model_id: string
  user_id: string
  status: 'queued' | 'submitted' | 'running' | 'succeeded' | 'failed'
  prompt_status: 'pending' | 'generating' | 'completed' | 'failed'
  prompt_job_id?: string
  request_payload: {
    refPaths: string[]
    targetPath: string
    prompt?: string // Will be populated when prompt generation completes
    size: string
  }
  error?: string
  created_at: string
  updated_at: string
}

// Queue management types
export interface PromptQueueStats {
  totalQueued: number
  totalProcessing: number
  totalCompleted: number
  totalFailed: number
  averageWaitTime: number
  estimatedWaitTime: number
}

// Retry configuration
export interface PromptRetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export const DEFAULT_RETRY_CONFIG: PromptRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
}
