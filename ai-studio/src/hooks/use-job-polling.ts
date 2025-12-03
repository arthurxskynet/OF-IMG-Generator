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
    failedAttempts?: number
    createdAt?: number
    lastPollAttempt?: number
    consecutiveErrors?: number
    isStuck?: boolean
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
    setPollingState(prev => {
      const existing = prev[jobId]
      const now = Date.now()
      // Resume polling for jobs that were previously stuck but are now recoverable
      const shouldResume = existing && !existing.polling && 
        ['queued', 'submitted', 'running', 'saving'].includes(existing.status) &&
        (now - (existing.lastUpdate || 0)) < 5 * 60 * 1000 // Only resume if less than 5 minutes old
      
      return {
        ...prev,
        [jobId]: {
          status: initialStatus || existing?.status || 'queued',
          polling: true,
          lastUpdate: existing?.lastUpdate || now,
          rowId: rowId || existing?.rowId,
          failedAttempts: existing?.failedAttempts || 0,
          createdAt: existing?.createdAt || now,
          lastPollAttempt: existing?.lastPollAttempt,
          consecutiveErrors: shouldResume ? 0 : (existing?.consecutiveErrors || 0),
          isStuck: false
        }
      }
    })
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
        // Stop polling jobs that have been failed for > 5 minutes (old backlog)
        if (state.status === 'failed') {
          const timeSinceCreated = now - (state.createdAt || now)
          if (timeSinceCreated > 5 * 60 * 1000) {
            // Stop polling old failed jobs
            updates[jobId] = {
              ...state,
              polling: false
            }
            continue
          }
        }
        
        // Check if job appears stuck (no update for extended period)
        const timeSinceLastUpdate = now - state.lastUpdate
        const timeSinceCreated = now - (state.createdAt || now)
        const isStuck = timeSinceLastUpdate > 2 * 60 * 1000 && // No update for 2+ minutes
          ['queued', 'submitted', 'running', 'saving'].includes(state.status) &&
          timeSinceCreated > 90 * 1000 // Job is at least 90 seconds old
        
        // Adaptive polling with exponential backoff for errors
        const consecutiveErrors = state.consecutiveErrors || 0
        const backoffDelay = Math.min(30000, 1000 * Math.pow(2, consecutiveErrors)) // Max 30s backoff
        const timeSinceLastPoll = now - (state.lastPollAttempt || 0)
        
        // Optimized polling intervals - less frequent to reduce server load
        const shouldPoll = 
          (state.status === 'running' || state.status === 'saving') && timeSinceLastPoll > Math.max(2000, backoffDelay) ||
          (state.status === 'queued' && timeSinceLastPoll > Math.max(3000, backoffDelay)) ||
          (state.status === 'submitted' && timeSinceLastPoll > Math.max(2000, backoffDelay)) ||
          (isStuck && timeSinceLastPoll > 10000) // Poll stuck jobs much less frequently

        if (!shouldPoll) continue
        
        // Additional safety: don't poll if we just polled very recently (within 500ms)
        // This prevents rapid-fire polling that can cause race conditions
        if (timeSinceLastPoll < 500) continue

        try {
          const result = await pollJob(jobId)
          
          // Reset consecutive errors on successful poll (even if status is failed, the poll succeeded)
          const newConsecutiveErrors = 0
          
          // Track failed attempts separately (for job status failures)
          const failedAttempts = result.status === 'failed' 
            ? (state.failedAttempts || 0) + 1 
            : (state.failedAttempts || 0)
          
          // Continue polling for active statuses, but stop after 10 failed status checks
          // This is more resilient than the previous 3-attempt limit
          const shouldContinuePolling = ['queued', 'running', 'submitted', 'saving'].includes(result.status as JobStatus) &&
            failedAttempts < 10 // Increased from 3 to 10 for better resilience
          
          updates[jobId] = {
            ...state,
            status: result.status,
            lastUpdate: now,
            lastPollAttempt: now,
            polling: shouldContinuePolling,
            error: result.error,
            queuePosition: result.queuePosition,
            step: result.step,
            failedAttempts,
            consecutiveErrors: newConsecutiveErrors,
            isStuck: isStuck && shouldContinuePolling // Mark as stuck if still active after timeout
          }

          // Call completion callback if job finished
          if (['succeeded', 'failed'].includes(result.status) && onJobComplete) {
            onJobComplete(jobId, result.status)
          }
        } catch (error) {
          console.error('Failed to poll job:', jobId, error)
          const failedAttempts = (state.failedAttempts || 0)
          const consecutiveErrors = (state.consecutiveErrors || 0) + 1
          
          // Use exponential backoff - stop polling after 10 consecutive network errors
          // This is more resilient than the previous 5-attempt limit
          const shouldContinuePolling = consecutiveErrors < 10
          
          updates[jobId] = {
            ...state,
            error: error instanceof Error ? error.message : 'Polling failed',
            lastUpdate: now,
            lastPollAttempt: now,
            failedAttempts,
            consecutiveErrors,
            polling: shouldContinuePolling,
            isStuck: isStuck || consecutiveErrors >= 5 // Mark as stuck after 5 consecutive errors
          }
          
          // If we've given up polling, mark as failed
          if (!shouldContinuePolling && onJobComplete) {
            onJobComplete(jobId, 'failed')
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
    }, 1500) // Base interval of 1.5 seconds, but jobs are polled less frequently based on status (reduced from 1s)

    return () => clearInterval(interval)
  }, [pollingState, onJobComplete])

  return {
    pollingState,
    startPolling,
    stopPolling,
    stopAllPolling
  }
}
