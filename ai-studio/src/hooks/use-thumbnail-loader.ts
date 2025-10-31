'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { GeneratedImage } from '@/types/jobs'
import { getSignedUrl } from '@/lib/jobs'
import { getOptimizedImageUrl } from '@/lib/image-loader'

interface ThumbnailLoaderState {
  thumbnailUrls: Record<string, string>
  fullUrls: Record<string, string>
  loadingFull: Set<string>
}

/**
 * Hook for intelligent thumbnail and full-resolution image loading
 * Automatically loads thumbnails on mount, lazy-loads full resolution on demand
 */
export function useThumbnailLoader(images: GeneratedImage[]) {
  const [state, setState] = useState<ThumbnailLoaderState>({
    thumbnailUrls: {},
    fullUrls: {},
    loadingFull: new Set()
  })
  
  const cacheRef = useRef<Map<string, { url: string; expires: number }>>(new Map())
  const CACHE_DURATION = 3.5 * 60 * 60 * 1000 // 3.5 hours
  
  // Track loaded image IDs to prevent duplicate fetches
  const loadedImageIdsRef = useRef<Set<string>>(new Set())
  
  // Store images in ref to avoid stale closures
  const imagesRef = useRef(images)
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  
  // Track image IDs as a string to detect changes without causing loops
  const imageIdsString = useMemo(() => images.map(img => img.id).join(','), [images])
  const prevImageIdsRef = useRef<string>('')
  
  // Load thumbnail URLs on mount and when images change
  useEffect(() => {
    // Reset loaded tracking when image IDs actually change
    if (imageIdsString !== prevImageIdsRef.current) {
      loadedImageIdsRef.current.clear()
      prevImageIdsRef.current = imageIdsString
    }
    
    const loadThumbnails = async () => {
      const currentImages = imagesRef.current
      if (!currentImages.length) return
      
      // Get images that need thumbnails loaded
      const imagesToLoad = currentImages.filter(img => {
        const cacheKey = `thumb_${img.id}`
        const cached = cacheRef.current.get(cacheKey)
        // Check current state via functional update to avoid stale closure
        return !loadedImageIdsRef.current.has(img.id) && (!cached || cached.expires < Date.now())
      })
      
      if (imagesToLoad.length === 0) return
      
      // Mark images as being loaded to prevent duplicates
      imagesToLoad.forEach(img => loadedImageIdsRef.current.add(img.id))
      
      // Determine which URL to use (thumbnail_url if available, fallback to output_url)
      const urlsToSign = imagesToLoad.map(img => {
        return img.thumbnail_url || img.output_url
      })
      
      try {
        // Batch fetch signed URLs with concurrency limit
        const CONCURRENCY_LIMIT = 10
        const results: Array<{ imageId: string; url: string }> = []
        
        for (let i = 0; i < urlsToSign.length; i += CONCURRENCY_LIMIT) {
          const batch = urlsToSign.slice(i, i + CONCURRENCY_LIMIT)
          const batchImages = imagesToLoad.slice(i, i + CONCURRENCY_LIMIT)
          
          const urlPromises = batch.map(async (path, batchIndex) => {
            const image = batchImages[batchIndex]
            const cacheKey = `thumb_${image.id}`
            
            // Check cache first
            const cached = cacheRef.current.get(cacheKey)
            if (cached && cached.expires > Date.now()) {
              return { imageId: image.id, url: cached.url }
            }
            
            try {
              // Use optimized proxy URL for Next.js Image Optimization
              // This reduces bandwidth costs by using Vercel's edge network
              const url = getOptimizedImageUrl(path)
              
              // Cache the URL
              cacheRef.current.set(cacheKey, {
                url,
                expires: Date.now() + CACHE_DURATION
              })
              
              return { imageId: image.id, url }
            } catch (error) {
              console.error(`Failed to load thumbnail for image ${image.id}:`, error)
              return { imageId: image.id, url: '' }
            }
          })
          
          const batchResults = await Promise.all(urlPromises)
          results.push(...batchResults)
        }
        
        // Update state with thumbnail URLs using functional update
        if (results.length > 0) {
          setState(prev => {
            // Check if we already have these URLs to prevent unnecessary updates
            const hasNewUrls = results.some(r => r.url && !prev.thumbnailUrls[r.imageId])
            if (!hasNewUrls) return prev
            
            const newThumbnailUrls: Record<string, string> = { ...prev.thumbnailUrls }
            results.forEach(r => {
              if (r.url) {
                newThumbnailUrls[r.imageId] = r.url
              }
            })
            
            return {
              ...prev,
              thumbnailUrls: newThumbnailUrls
            }
          })
        }
      } catch (error) {
        console.error('Failed to load thumbnails:', error)
        // Remove failed images from loaded set so they can be retried
        imagesToLoad.forEach(img => loadedImageIdsRef.current.delete(img.id))
      }
    }
    
    loadThumbnails()
  }, [imageIdsString])
  
  // Track loading promises to avoid duplicate requests
  const loadingPromisesRef = useRef<Map<string, Promise<string | null>>>(new Map())
  
  /**
   * Load full resolution image on demand
   * Call this when user expands/clicks on an image
   */
  const loadFullImage = useCallback(async (imageId: string): Promise<string | null> => {
    const currentImages = imagesRef.current
    const image = currentImages.find(img => img.id === imageId)
    if (!image) return null
    
    // Check cache first (synchronous check)
    const cacheKey = `full_${imageId}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      // Update state if not already there
      setState(prev => {
        if (prev.fullUrls[imageId]) return prev
        return {
          ...prev,
          fullUrls: {
            ...prev.fullUrls,
            [imageId]: cached.url
          }
        }
      })
      return cached.url
    }
    
    // Check if already loading
    const existingPromise = loadingPromisesRef.current.get(imageId)
    if (existingPromise) {
      return existingPromise
    }
    
    // Check current state
    setState(prev => {
      if (prev.fullUrls[imageId]) {
        return prev
      }
      if (prev.loadingFull.has(imageId)) {
        return prev
      }
      return {
        ...prev,
        loadingFull: new Set([...prev.loadingFull, imageId])
      }
    })
    
    // Create and store the promise
    const promise = (async () => {
      try {
        // Use optimized proxy URL for Next.js Image Optimization
        // This reduces bandwidth costs by using Vercel's edge network
        const url = getOptimizedImageUrl(image.output_url)
        
        // Cache the URL
        cacheRef.current.set(cacheKey, {
          url,
          expires: Date.now() + CACHE_DURATION
        })
        
        // Update state
        setState(prev => ({
          ...prev,
          fullUrls: {
            ...prev.fullUrls,
            [imageId]: url
          },
          loadingFull: new Set([...Array.from(prev.loadingFull)].filter(id => id !== imageId))
        }))
        
        loadingPromisesRef.current.delete(imageId)
        return url
      } catch (error) {
        console.error(`Failed to load full image for ${imageId}:`, error)
        setState(prev => ({
          ...prev,
          loadingFull: new Set([...Array.from(prev.loadingFull)].filter(id => id !== imageId))
        }))
        loadingPromisesRef.current.delete(imageId)
        return null
      }
    })()
    
    loadingPromisesRef.current.set(imageId, promise)
    return promise
  }, [])
  
  /**
   * Preload full resolution for adjacent images (for dialog navigation)
   */
  const preloadAdjacentImages = useCallback(async (currentImageId: string, direction: 'prev' | 'next') => {
    const currentImages = imagesRef.current
    const currentIndex = currentImages.findIndex(img => img.id === currentImageId)
    if (currentIndex === -1) return
    
    const adjacentIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
    if (adjacentIndex < 0 || adjacentIndex >= currentImages.length) return
    
    const adjacentImage = currentImages[adjacentIndex]
    
    // Check if already loaded or loading
    const cacheKey = `full_${adjacentImage.id}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached && cached.expires > Date.now()) return
    
    if (loadingPromisesRef.current.has(adjacentImage.id)) return
    
    // Preload the adjacent image
    loadFullImage(adjacentImage.id).catch(() => {})
  }, [loadFullImage])
  
  return {
    thumbnailUrls: state.thumbnailUrls,
    fullUrls: state.fullUrls,
    loadFullImage,
    preloadAdjacentImages,
    isLoadingFull: (imageId: string) => state.loadingFull.has(imageId)
  }
}


