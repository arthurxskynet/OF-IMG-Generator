'use client'

import { useState, useEffect, useCallback } from 'react'
import { pollJob } from '@/lib/jobs'
import { JobStatus } from '@/types/jobs'

interface JobPollingState {
  [jobId: string]: {
    status: JobStatus | string
    polling: boolean
    lastUpdate: number
    error?: string
    rowId?: string
    queuePosition?: number
    step?: 'queued' | 'submitted' | 'running' | 'saving' | 'done' | 'failed'
  }
}

interface UseJobPollingReturn {
  pollingState: JobPollingState
  startPolling: (jobId: string, initialStatus?: JobStatus | string, rowId?: string) => void
  stopPolling: (jobId: string) => void
  stopAllPolling: () => void
}

export function useJobPolling(onJobComplete?: (jobId: string, status: JobStatus | string) => void): UseJobPollingReturn {
  const [pollingState, setPollingState] = useState<JobPollingState>({})

  const startPolling = useCallback((jobId: string, initialStatus: JobStatus | string = 'queued', rowId?: string) => {
    setPollingState(prev => ({
      ...prev,
      [jobId]: {
        status: initialStatus,
        polling: true,
        lastUpdate: Date.now(),
        rowId
      }
    }))
  }, [])

  const stopPolling = useCallback((jobId: string) => {
    setPollingState(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        polling: false
      }
    }))
  }, [])

  const stopAllPolling = useCallback(() => {
    setPollingState(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(jobId => {
        next[jobId] = { ...next[jobId], polling: false }
      })
      return next
    })
  }, [])

  // Polling effect with adaptive intervals
  useEffect(() => {
    const interval = setInterval(async () => {
      const activeJobs = Object.entries(pollingState).filter(([_, state]) => 
        state.polling && ['queued', 'running', 'submitted', 'saving'].includes(state.status)
      )

      if (activeJobs.length === 0) return

      const updates: Record<string, JobPollingState[string]> = {}
      const now = Date.now()

      for (const [jobId, state] of activeJobs) {
        // Adaptive polling: slower for newly queued jobs, faster for running jobs
        const timeSinceLastUpdate = now - state.lastUpdate
        const shouldPoll = 
          state.status === 'running' || state.status === 'saving' ||
          (state.status === 'queued' && timeSinceLastUpdate > 2000) ||
          (state.status === 'submitted' && timeSinceLastUpdate > 1500)

        if (!shouldPoll) continue

        try {
          const result = await pollJob(jobId)
          
          updates[jobId] = {
            ...state,
            status: result.status,
            lastUpdate: now,
            polling: ['queued', 'running', 'submitted', 'saving'].includes(result.status as JobStatus),
            error: result.error,
            queuePosition: result.queuePosition,
            step: result.step
          }

          // Call completion callback if job finished
          if (['succeeded', 'failed'].includes(result.status) && onJobComplete) {
            onJobComplete(jobId, result.status)
          }
        } catch (error) {
          console.error('Failed to poll job:', jobId, error)
          updates[jobId] = {
            ...state,
            error: error instanceof Error ? error.message : 'Polling failed',
            lastUpdate: now
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        setPollingState(prev => {
          const next: JobPollingState = { ...prev }
          for (const [k, v] of Object.entries(updates)) {
            next[k] = v
          }
          return next
        })
      }
    }, 1000) // Base interval of 1 second, but jobs are polled less frequently based on status

    return () => clearInterval(interval)
  }, [pollingState, onJobComplete])

  return {
    pollingState,
    startPolling,
    stopPolling,
    stopAllPolling
  }
}
