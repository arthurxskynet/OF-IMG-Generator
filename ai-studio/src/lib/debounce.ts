/**
 * Centralized debounce utility for consistent timing across the application
 */

export const DEBOUNCE_TIMES = {
  // Image operations - fast feedback needed
  IMAGE_INSERT: 300, // Reference and generated image inserts
  IMAGE_UPDATE: 200, // Image updates
  IMAGE_DELETE: 100, // Image deletions - immediate feedback
  
  // Row operations
  ROW_UPDATE: 300, // Row property updates (prompt, name, etc.)
  ROW_REFRESH: 500, // Single row refresh
  
  // Full refresh operations
  FULL_REFRESH: 1500, // Full data refresh - most expensive
  
  // Server sync
  ROUTER_REFRESH: 300, // Server component refresh
} as const

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, wait)
  }
}

/**
 * Creates a debounced function that returns a promise
 * Useful for async operations that need debouncing
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout | null = null
  let pendingPromise: Promise<ReturnType<T>> | null = null
  let resolvePending: ((value: ReturnType<T>) => void) | null = null

  return function debounced(...args: Parameters<T>): Promise<ReturnType<T>> {
    return new Promise((resolve) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      
      // If there's a pending promise, resolve it with the new call
      if (resolvePending) {
        resolvePending = resolve
      } else {
        resolvePending = resolve
        pendingPromise = func(...args).then((result) => {
          resolvePending?.(result)
          resolvePending = null
          pendingPromise = null
          return result
        })
      }

      timeoutId = setTimeout(() => {
        if (pendingPromise) {
          pendingPromise.then((result) => {
            resolvePending?.(result)
            resolvePending = null
            pendingPromise = null
          })
        }
        timeoutId = null
      }, wait)
    })
  }
}

