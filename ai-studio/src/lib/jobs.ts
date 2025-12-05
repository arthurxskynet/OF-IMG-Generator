import { CreateJobsInput, JobStatus, PollJobResponse, ActiveJobSummary } from '@/types/jobs'

// Client-side API functions for job management

export async function createJobs(input: CreateJobsInput): Promise<any> {
  const res = await fetch('/api/jobs/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {
      try {
        message = await res.text()
      } catch {}
    }
    throw new Error(message || 'Failed to create jobs')
  }
  return res.json()
}

export async function pollJob(jobId: string): Promise<PollJobResponse> {
  const res = await fetch(`/api/jobs/${jobId}/poll`, {
    method: 'GET',
    cache: 'no-store'
  })
  
  if (!res.ok) {
    const error = await res.text()
    throw new Error(error)
  }
  
  return res.json()
}

export async function getSignedUrl(path: string): Promise<{ url: string } | null> {
  const res = await fetch(`/api/storage/sign?path=${encodeURIComponent(path)}`, {
    method: 'GET',
    cache: 'no-store'
  })
  
  if (!res.ok) {
    // Handle 404 (file not found) gracefully - this is expected for missing thumbnails/files
    if (res.status === 404) {
      return null
    }
    
    // For other errors, try to parse error message
    let errorMessage = `${res.status} ${res.statusText}`
    try {
      const errorText = await res.text()
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorText
        } catch {
          errorMessage = errorText
        }
      }
    } catch {
      // If we can't parse the error, use the status text
    }
    
    throw new Error(errorMessage)
  }
  
  return res.json()
}

// Utility functions for status handling
export function getStatusColor(status: JobStatus | string): string {
  switch (status) {
    case 'idle': return 'muted'
    case 'queued': return 'warning'
    case 'running':
    case 'submitted': return 'info'
    case 'saving': return 'info'
    case 'partial': return 'secondary'
    case 'done':
    case 'succeeded': return 'success'
    case 'error':
    case 'failed': return 'destructive'
    default: return 'muted'
  }
}

export function getStatusLabel(status: JobStatus | string): string {
  switch (status) {
    case 'queued': return 'Queued'
    case 'running': return 'Running'
    case 'submitted': return 'Submitted'
    case 'saving': return 'Saving'
    case 'succeeded': return 'Done'
    case 'failed': return 'Failed'
    case 'partial': return 'Partial'
    case 'idle': return 'Idle'
    case 'done': return 'Complete'
    case 'error': return 'Error'
    default: return status
  }
}

export async function fetchActiveJobs(modelId: string): Promise<ActiveJobSummary[]> {
  const res = await fetch(`/api/jobs/active?modelId=${encodeURIComponent(modelId)}`, {
    method: 'GET',
    cache: 'no-store'
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(error)
  }
  const data = await res.json()
  return data.jobs as ActiveJobSummary[]
}
