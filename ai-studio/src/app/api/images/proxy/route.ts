import { NextRequest, NextResponse } from 'next/server'
import { signPath } from '@/lib/storage'

// In-memory cache for signed URLs (works within the same serverless function instance)
// Key: storage path, Value: { signedUrl: string, expires: number }
// NOTE: This only caches signed URLs (strings), not image data - keeping memory usage minimal
const signedUrlCache = new Map<string, { signedUrl: string; expires: number }>()
const CACHE_DURATION = 3.5 * 60 * 60 * 1000 // 3.5 hours

/**
 * Optimized image proxy for Next.js Image Optimization
 * This route generates signed URLs from Supabase Storage and streams the image
 * Next.js Image Optimization will then cache and optimize these images
 * 
 * CRITICAL OPTIMIZATION: Streams responses instead of buffering in memory
 * - Prevents high memory usage that triggers Vercel's fluid provisioned memory
 * - Reduces serverless function costs significantly
 * - Reduces Supabase bandwidth costs (images cached on Vercel edge)
 * - Automatic WebP/AVIF conversion
 * - Automatic resizing based on device
 * - Edge caching (free on Vercel)
 * - Server-side signed URL caching prevents repeated API calls
 * 
 * Route caching: Keep dynamic to handle query params, but rely on Cache-Control headers
 * and Next.js fetch caching for edge optimization. Vercel will cache at edge based on URL.
 */
export const revalidate = 12600 // 3.5 hours - cache revalidation time

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const encodedPath = searchParams.get('path')
    
    if (!encodedPath) {
      return NextResponse.json({ error: 'Path parameter is required' }, { status: 400 })
    }
    
    // Decode the path parameter (it was encoded when creating the proxy URL)
    let path: string
    try {
      path = decodeURIComponent(encodedPath)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid path encoding' }, { status: 400 })
    }
    
    // Normalize leading slashes (allow "/outputs/..." as well)
    path = path.replace(/^\/+/, '')
    
    // Allow two forms for backward compatibility:
    // 1) "bucket/key" object paths (preferred)
    // 2) Full Supabase Storage URLs (signed or public) - extract object path safely
    const isObjectPath = /^(outputs|refs|targets|thumbnails)\/.+$/i.test(path)
    const isHttpUrl = /^https?:\/\//i.test(path)

    // If a full Supabase Storage URL was provided, extract the object path "bucket/key"
    if (!isObjectPath && isHttpUrl) {
      try {
        const url = new URL(path)
        // Only allow Supabase storage hosts to avoid SSRF: *.supabase.co
        const isSupabaseHost = /\.supabase\.co$/i.test(url.host)
        const isStoragePath = url.pathname.includes('/storage/v1/object/')
        if (!isSupabaseHost || !isStoragePath) {
          console.warn('[Image Proxy] Rejected non-supabase URL', { host: url.host, pathname: url.pathname })
          return NextResponse.json({ error: 'External URL not allowed' }, { status: 400 })
        }
        // Extract bucket/key after optional public/sign segment
        const parts = url.pathname.split('/').filter(Boolean)
        const idx = parts.findIndex(seg => seg === 'object')
        if (idx === -1) {
          return NextResponse.json({ error: 'Invalid storage URL' }, { status: 400 })
        }
        const afterObject = parts[idx + 1]
        let bucketIndex = idx + 1
        if (afterObject === 'public' || afterObject === 'sign') {
          bucketIndex = idx + 2
        }
        const bucket = parts[bucketIndex]
        const key = parts.slice(bucketIndex + 1).join('/')
        const extracted = bucket && key ? `${bucket}/${key}` : ''
        if (!extracted || !/^(outputs|refs|targets|thumbnails)\/.+$/i.test(extracted)) {
          console.warn('[Image Proxy] Rejected bucket or key not allowed', { bucket, keyPreview: key?.slice(0, 16) })
          return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
        }
        path = extracted
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
      }
    }
    
    // Final validation for object path shape
    if (!/^(outputs|refs|targets|thumbnails)\/.+$/i.test(path)) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }
    
    // Cleanup expired cache periodically (every 10th request)
    if (Math.random() < 0.1) {
      cleanupExpiredCache()
    }
    
    // Check cache for signed URL first (use the normalized key)
    const cacheKey = path
    const cached = signedUrlCache.get(cacheKey)
    let signedUrl: string
    
    if (cached && cached.expires > Date.now()) {
      // Use cached signed URL
      signedUrl = cached.signedUrl
    } else {
      // Always sign the object path (even if user sent a full URL)
      // Ensures consistent expiry and host, avoids relying on client tokens
      signedUrl = await signPath(path, 14400)
      
      // Cache the signed URL
      signedUrlCache.set(cacheKey, {
        signedUrl,
        expires: Date.now() + CACHE_DURATION
      })
    }
    
    // Stream the image directly from Supabase without buffering in memory
    // This is CRITICAL to prevent high memory usage and costs
    try {
      const imageResponse = await fetch(signedUrl, {
        // Use Next.js fetch caching with tags for revalidation
        next: { 
          revalidate: 12600, // 3.5 hours
          tags: [`image-${path}`]
        }
      })
      
      if (!imageResponse.ok) {
        // Clear cache on error so we can retry on next request
        signedUrlCache.delete(cacheKey)
        return NextResponse.json(
          { error: 'Failed to fetch image from storage' },
          { status: imageResponse.status }
        )
      }
      
      // Get content type from response headers
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
      
      // Stream the response body directly - DO NOT buffer in memory
      // This prevents triggering Vercel's fluid provisioned memory
      return new NextResponse(imageResponse.body, {
        headers: {
          'Content-Type': contentType,
          // Aggressive caching headers
          // s-maxage: edge/CDN cache (3.5 hours), max-age: browser cache
          // stale-while-revalidate: serve stale content for 24h while revalidating in background
          'Cache-Control': 'public, s-maxage=12600, max-age=12600, stale-while-revalidate=86400, immutable',
          // Prevent content type sniffing
          'X-Content-Type-Options': 'nosniff',
          // Allow Next.js Image Optimization to process different formats
          'Vary': 'Accept',
        },
      })
    } catch (error) {
      // Clear cache on error so we can retry on next request
      signedUrlCache.delete(cacheKey)
      console.error('Image proxy fetch error:', error)
      
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Image proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Clean up expired cache entries periodically
// This runs on-demand during requests to avoid memory leaks
function cleanupExpiredCache() {
  const now = Date.now()
  let cleaned = 0
  for (const [path, cached] of signedUrlCache.entries()) {
    if (cached.expires <= now) {
      signedUrlCache.delete(path)
      cleaned++
    }
  }
  // Limit cache size to prevent memory issues (max 1000 entries)
  if (signedUrlCache.size > 1000) {
    const entries = Array.from(signedUrlCache.entries())
    entries.sort((a, b) => a[1].expires - b[1].expires)
    const toDelete = entries.slice(0, signedUrlCache.size - 1000)
    toDelete.forEach(([path]) => signedUrlCache.delete(path))
  }
}
