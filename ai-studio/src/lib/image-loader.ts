// Server-neutral image URL utilities

import { getSignedUrl } from './jobs'

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
 * Convert storage path to optimized proxy URL
 * This uses Next.js Image Optimization to reduce bandwidth costs
 */
export function getOptimizedImageUrl(path: string): string {
  if (!path) return ''
  
  // Normalize possible full Supabase URLs or leading slashes to object path "bucket/key"
  const normalizeToObjectPath = (input: string): string => {
    let p = input.trim()
    if (!p) return ''
    // Strip leading slashes and collapse multiple slashes
    p = p.replace(/\/{2,}/g, '/').replace(/^\/+/, '')
    // If it's a full URL, attempt to extract the object path
    if (/^https?:\/\//i.test(p)) {
      try {
        const url = new URL(p)
        // Accept any valid Supabase storage host to be resilient to env misconfig
        const isSupabaseHost = /\.supabase\.co$/i.test(url.host)
        if (isSupabaseHost && url.pathname.includes('/storage/v1/object/')) {
          // pathname patterns we may encounter:
          // /storage/v1/object/outputs/<key>
          // /storage/v1/object/public/outputs/<key>
          // /storage/v1/object/sign/outputs/<key>?token=...
          const parts = url.pathname.split('/').filter(Boolean)
          const idx = parts.findIndex(seg => seg === 'object')
          if (idx !== -1 && parts.length > idx + 2) {
            // Skip optional marker after 'object' (e.g., 'public' or 'sign')
            const afterObject = parts[idx + 1]
            let bucketIndex = idx + 1
            if (afterObject === 'public' || afterObject === 'sign') {
              bucketIndex = idx + 2
            }
            const bucket = parts[bucketIndex]
            const key = parts.slice(bucketIndex + 1).join('/')
            if (bucket && key) return `${bucket}/${key}`
          }
        }
        // If not our project or unrecognized format, fall through and return the original input
      } catch {}
    }
    // Strip accidental public/ prefix (public/outputs/...)
    if (/^public\/(outputs|refs|targets|thumbnails)\//i.test(p)) {
      p = p.replace(/^public\//i, '')
    }
    return p
  }
  
  const objectPath = normalizeToObjectPath(path)
  
  // Encode the normalized path as a query parameter
  const encodedPath = encodeURIComponent(objectPath)
  
  // Use the proxy route for Next.js Image Optimization
  // Next.js will automatically optimize (resize, convert to WebP/AVIF, cache on edge)
  return `/api/images/proxy?path=${encodedPath}`
}

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
  const promise = getSignedUrl(path).then(response => {
    const url = response.url
    urlCache.set(path, {
      url,
      expires: Date.now() + CACHE_DURATION
    })
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
  const uniquePaths = [...new Set(paths)]
  const results: Record<string, string> = {}
  
  // Process all URLs in parallel
  const promises = uniquePaths.map(async (path) => {
    try {
      const url = await getCachedSignedUrl(path)
      results[path] = url
    } catch (error) {
      console.error(`Failed to get signed URL for ${path}:`, error)
      results[path] = ''
    }
  })
  
  await Promise.all(promises)
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
