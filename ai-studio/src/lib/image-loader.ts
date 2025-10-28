'use client'

import { getSignedUrls } from './jobs'

// Global cache for signed URLs with expiration
interface CachedUrl {
  url: string
  expires: number
  promise?: Promise<string>
}

const urlCache = new Map<string, CachedUrl>()

// Cache duration: 3.5 hours (slightly less than 4-hour expiration)
const CACHE_DURATION = 3.5 * 60 * 60 * 1000

/**
 * Get signed URL with intelligent caching and deduplication
 * Prevents multiple requests for the same URL
 */
export async function getCachedSignedUrl(path: string): Promise<string> {
  const cached = urlCache.get(path)
  
  // Return cached URL if still valid
  if (cached && cached.expires > Date.now()) {
    return cached.url
  }
  
  // If there's already a request in progress, wait for it
  if (cached?.promise) {
    return cached.promise
  }
  
  // Create new request and cache the promise to prevent duplicates
  const promise = getSignedUrls([path]).then(response => {
    const url = response[path] || ''
    if (url) {
      urlCache.set(path, {
        url,
        expires: Date.now() + CACHE_DURATION
      })
    } else {
      urlCache.delete(path)
    }
    return url
  }).catch(error => {
    // Remove failed promise from cache
    urlCache.delete(path)
    throw error
  })
  
  // Cache the promise immediately
  urlCache.set(path, {
    url: '',
    expires: 0,
    promise
  })
  
  return promise
}

/**
 * Batch fetch multiple signed URLs in parallel
 * Returns a map of path -> url
 */
export async function batchGetSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  const results: Record<string, string> = {}

  const pendingPromises: Promise<void>[] = []
  const pathsToFetch: string[] = []

  for (const path of uniquePaths) {
    const cached = urlCache.get(path)

    if (cached && cached.expires > Date.now()) {
      results[path] = cached.url
      continue
    }

    if (cached?.promise) {
      const promise = cached.promise.then(url => {
        results[path] = url
      }).catch(() => {
        results[path] = ''
      })
      pendingPromises.push(promise)
      continue
    }

    pathsToFetch.push(path)
  }

  if (pathsToFetch.length > 0) {
    const fetchPromise = getSignedUrls(pathsToFetch)

    for (const path of pathsToFetch) {
      const promise = fetchPromise.then(map => {
        const url = map[path] || ''
        if (url) {
          urlCache.set(path, {
            url,
            expires: Date.now() + CACHE_DURATION
          })
        } else {
          urlCache.delete(path)
        }
        results[path] = url
        return url
      }).catch(error => {
        urlCache.delete(path)
        results[path] = ''
        console.error(`Failed to get signed URL for ${path}:`, error)
        throw error
      })

      urlCache.set(path, {
        url: '',
        expires: 0,
        promise
      })

      pendingPromises.push(promise.then(() => undefined).catch(() => undefined))
    }
  }

  if (pendingPromises.length > 0) {
    await Promise.allSettled(pendingPromises)
  }

  return results
}

/**
 * Preload images for instant display
 * Returns a promise that resolves when all images are loaded
 */
export function preloadImages(urls: string[]): Promise<void[]> {
  return Promise.all(
    urls
      .filter(url => url) // Filter out empty URLs
      .map(url => {
        return new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
          img.src = url
        })
      })
  )
}

/**
 * Clear expired entries from cache
 */
export function clearExpiredCache(): void {
  const now = Date.now()
  for (const [path, cached] of urlCache.entries()) {
    if (cached.expires <= now && !cached.promise) {
      urlCache.delete(path)
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  urlCache.clear()
}

// Clean up expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(clearExpiredCache, 5 * 60 * 1000)
}
