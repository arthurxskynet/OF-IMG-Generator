import { CreateJobsInput, JobStatus, PollJobResponse, ActiveJobSummary } from '@/types/jobs'

// Client-side API functions for job management

export async function createJobs(input: CreateJobsInput): Promise<{ ok: boolean; enqueued: number; jobIds: string[] }> {
  const res = await fetch('/api/jobs/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  })
  
  if (!res.ok) {
    const error = await res.text()
    throw new Error(error)
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

export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const res = await fetch('/api/storage/sign', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths })
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(error)
  }

  const data = await res.json()
  return data?.urls ?? data ?? {}
}

export async function getSignedUrl(path: string): Promise<{ url: string }> {
  const urls = await getSignedUrls([path])
  const url = urls[path]
  if (!url) {
    throw new Error('Failed to retrieve signed URL')
  }
  return { url }
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
