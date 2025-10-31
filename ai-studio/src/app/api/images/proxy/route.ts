import { NextRequest, NextResponse } from 'next/server'
import { signPath } from '@/lib/storage'
import { cache } from 'react'

// In-memory cache for signed URLs (works within the same serverless function instance)
// Key: storage path, Value: { signedUrl: string, expires: number }
const signedUrlCache = new Map<string, { signedUrl: string; expires: number }>()
const CACHE_DURATION = 3.5 * 60 * 60 * 1000 // 3.5 hours

// Cache the image fetching to reduce Supabase bandwidth
// This uses React cache() which is request-memoized
const getCachedImage = cache(async (signedUrl: string, path: string) => {
  const imageResponse = await fetch(signedUrl, {
    // Use Next.js fetch caching
    next: { 
      revalidate: 12600, // 3.5 hours
      tags: [`image-${path}`]
    }
  })
  
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`)
  }
  
  const imageBuffer = await imageResponse.arrayBuffer()
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
  
  return { imageBuffer, contentType }
})

/**
 * Optimized image proxy for Next.js Image Optimization
 * This route generates signed URLs from Supabase Storage and returns the image
 * Next.js Image Optimization will then cache and optimize these images
 * Benefits:
 * - Reduces Supabase bandwidth costs (images cached on Vercel edge)
 * - Automatic WebP/AVIF conversion
 * - Automatic resizing based on device
 * - Edge caching (free on Vercel)
 * - Server-side signed URL caching prevents repeated API calls
 */
// Configure route caching
export const dynamic = 'force-dynamic' // Required for query params
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
    
    // Validate path to prevent abuse - must start with allowed bucket and have content after
    if (!path.match(/^(outputs|refs|targets|thumbnails)\/.+$/)) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }
    
    // Cleanup expired cache periodically (every 10th request)
    if (Math.random() < 0.1) {
      cleanupExpiredCache()
    }
    
    // Check cache for signed URL first
    const cached = signedUrlCache.get(path)
    let signedUrl: string
    
    if (cached && cached.expires > Date.now()) {
      // Use cached signed URL
      signedUrl = cached.signedUrl
    } else {
      // Generate new signed URL (4 hour expiry)
      signedUrl = await signPath(path, 14400)
      
      // Cache the signed URL
      signedUrlCache.set(path, {
        signedUrl,
        expires: Date.now() + CACHE_DURATION
      })
    }
    
    // Fetch the image from Supabase using React cache for request deduplication
    let imageBuffer: ArrayBuffer
    let contentType: string
    
    try {
      const result = await getCachedImage(signedUrl, path)
      imageBuffer = result.imageBuffer
      contentType = result.contentType
    } catch (error) {
      // Clear cache on error so we can retry on next request
      signedUrlCache.delete(path)
      console.error('Image proxy fetch error:', error)
      
      // Return appropriate error based on error type
      if (error instanceof Error && error.message.includes('Failed to fetch image')) {
        const statusMatch = error.message.match(/\d+/)
        const status = statusMatch ? parseInt(statusMatch[0]) : 500
        return NextResponse.json(
          { error: 'Failed to fetch image from storage' },
          { status }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: 500 }
      )
    }
    
    // Return image with aggressive caching headers
    // This prevents Next.js from fetching on every refresh
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        // Cache for 3.5 hours on CDN/edge, allow stale for 24h
        // s-maxage: edge/CDN cache, max-age: browser cache
        'Cache-Control': 'public, s-maxage=12600, max-age=12600, stale-while-revalidate=86400, immutable',
        // Prevent content type sniffing
        'X-Content-Type-Options': 'nosniff',
        // Allow Next.js Image Optimization to process different formats
        'Vary': 'Accept',
      },
    })
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
