import { z } from 'zod'

// API Schemas
export const CreateJobsSchema = z.object({
  rowId: z.string().uuid(),
  useAiPrompt: z.boolean().optional().default(false)
})

// Type definitions
export type CreateJobsInput = z.infer<typeof CreateJobsSchema>

// Job status types
export type JobStatus = 'queued' | 'running' | 'submitted' | 'saving' | 'succeeded' | 'failed'
export type RowStatus = 'idle' | 'queued' | 'running' | 'partial' | 'done' | 'error'

// Database row types (simplified - adjust based on your actual schema)
export interface Job {
  id: string
  row_id: string
  model_id: string
  team_id: string
  user_id: string
  status: JobStatus
  provider_request_id?: string
  prompt_job_id?: string
  prompt_status?: 'pending' | 'generating' | 'completed' | 'failed'
  request_payload: {
    refPaths: string[]
    targetPath: string
    prompt: string
    size: string
  }
  error?: string
  created_at: string
  updated_at: string
}

export interface ModelRow {
  id: string
  model_id: string
  ref_image_urls?: string[]
  target_image_url?: string
  prompt_override?: string
  status: RowStatus
  created_at: string
  updated_at: string
}

export interface GeneratedImage {
  id: string
  job_id?: string
  row_id: string
  model_id: string
  team_id: string
  user_id: string
  output_url: string
  is_favorited?: boolean
  is_upscaled?: boolean
  created_at: string
}

export interface Model {
  id: string
  name: string
  team_id: string
  owner_id: string
  default_prompt?: string
  default_ref_headshot_url?: string
  size: string
  requests_default: number
  created_at: string
  updated_at: string
}

// Extended poll response payload
export interface PollJobResponse {
  status: JobStatus
  error?: string
  queuePosition?: number
  step?: 'queued' | 'submitted' | 'running' | 'saving' | 'done' | 'failed'
}

export interface ActiveJobSummary {
  job_id: string
  row_id: string
  status: JobStatus
  created_at: string
}

// UI State types
export interface JobPollingState {
  [jobId: string]: {
    status: JobStatus
    rowId?: string
    queuePosition?: number
    step?: 'queued' | 'submitted' | 'running' | 'saving' | 'done' | 'failed'
    error?: string
    polling: boolean
    lastUpdate: number
  }
}

export interface RowPollingState {
  [rowId: string]: {
    jobs: Job[]
    images: GeneratedImage[]
    polling: boolean
    lastUpdate: number
  }
}
