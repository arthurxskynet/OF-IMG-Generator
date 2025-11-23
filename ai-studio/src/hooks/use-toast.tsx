'use client'

import { useState, useCallback, useEffect } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

interface UseToastReturn {
  toast: (props: Omit<Toast, 'id'>) => void
  toasts: Toast[]
  dismiss: (id: string) => void
}

// Global toast state - shared across all components
let globalToasts: Toast[] = []
let globalListeners: Set<() => void> = new Set()
let toastCount = 0

// Function to notify all listeners of state changes
function notifyListeners() {
  globalListeners.forEach(listener => listener())
}

// Global toast functions
function addToast(props: Omit<Toast, 'id'>) {
  const id = `toast-${++toastCount}`
  const newToast: Toast = {
    ...props,
    id,
    variant: props.variant || 'default'
  }

  globalToasts = [...globalToasts, newToast]
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Toast] Adding toast:', { id, title: newToast.title, description: newToast.description, totalToasts: globalToasts.length })
  }
  
  notifyListeners()

  // Auto dismiss after 5 seconds
  setTimeout(() => {
    globalToasts = globalToasts.filter(t => t.id !== id)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Toast] Auto-dismissing toast:', id)
    }
    notifyListeners()
  }, 5000)
}

function removeToast(id: string) {
  globalToasts = globalToasts.filter(t => t.id !== id)
  notifyListeners()
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>(globalToasts)

  useEffect(() => {
    // Update local state when global state changes
    const updateState = () => {
      setToasts([...globalToasts])
    }

    // Add this component as a listener
    globalListeners.add(updateState)
    
    // Initial sync
    updateState()

    // Cleanup on unmount
    return () => {
      globalListeners.delete(updateState)
    }
  }, [])

  const toast = useCallback((props: Omit<Toast, 'id'>) => {
    addToast(props)
  }, [])

  const dismiss = useCallback((id: string) => {
    removeToast(id)
  }, [])

  return {
    toast,
    toasts,
    dismiss
  }
}

// Simple toast notification component with animations
export function Toaster() {
  const { toasts, dismiss } = useToast()

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Toaster] Current toasts:', toasts.length, toasts)
    }
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] space-y-2 pointer-events-none">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-4 rounded-lg shadow-lg max-w-sm toast-enter ${
            toast.variant === 'destructive' 
              ? 'bg-destructive text-destructive-foreground border border-destructive/50' 
              : 'bg-background border border-border shadow-xl'
          }`}
          style={{
            animationDelay: `${index * 50}ms`,
          }}
          onClick={() => dismiss(toast.id)}
        >
          <div className="flex items-start gap-3">
            {toast.variant !== 'destructive' && (
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            )}
            {toast.variant === 'destructive' && (
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-destructive-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{toast.title}</div>
              {toast.description && (
                <div className="text-sm opacity-90 mt-1 leading-relaxed">{toast.description}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismiss(toast.id)
              }}
              className="flex-shrink-0 ml-2 opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
