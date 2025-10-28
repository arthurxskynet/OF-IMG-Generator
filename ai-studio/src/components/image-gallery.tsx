'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GeneratedImage } from '@/types/jobs'
import { useToast } from '@/hooks/use-toast'
import { Copy, Maximize2 } from 'lucide-react'
import { batchGetSignedUrls, preloadImages } from '@/lib/image-loader'

const IMAGES_PER_PAGE = 24
const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgwJ/lpX6KAAAAABJRU5ErkJggg=='

interface ImageGalleryProps {
  images: GeneratedImage[]
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const { toast } = useToast()
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set())
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [visibleCount, setVisibleCount] = useState(IMAGES_PER_PAGE)

  const visibleImages = useMemo(
    () => images.slice(0, Math.min(images.length, visibleCount)),
    [images, visibleCount]
  )

  const hasMoreImages = visibleCount < images.length

  // Optimized prefetch with parallel loading and image preloading
  useEffect(() => {
    const prefetch = async () => {
      if (!visibleImages.length) return

      // Get all unique image paths
      const imagePaths = visibleImages.map(img => img.output_url)
      const newPaths = imagePaths.filter(path => !signedUrls[path])

      if (newPaths.length === 0) return

      try {
        // Batch fetch all signed URLs in parallel
        const newUrls = await batchGetSignedUrls(newPaths)
        
        // Update state with all URLs at once
        setSignedUrls(prev => ({ ...prev, ...newUrls }))
        
        // Preload images for instant display
        const validUrls = Object.values(newUrls).filter(url => url)
        if (validUrls.length > 0) {
          setLoadingImages(new Set(validUrls))
          await preloadImages(validUrls)
          setLoadingImages(new Set())
        }
      } catch (error) {
        console.error('Failed to prefetch images:', error)
        setLoadingImages(new Set())
      }
    }
    
    prefetch()
  }, [visibleImages, signedUrls])

  const ensureSignedUrl = useCallback(
    async (path: string) => {
      if (signedUrls[path]) {
        return signedUrls[path]
      }

      try {
        const newUrls = await batchGetSignedUrls([path])
        const url = newUrls[path]
        setSignedUrls(prev => ({ ...prev, ...newUrls }))
        return url
      } catch (error) {
        console.error('Failed to fetch signed URL:', error)
        throw error
      }
    },
    [signedUrls]
  )

  const handleCopyUrl = async (image: GeneratedImage) => {
    try {
      const url = await ensureSignedUrl(image.output_url)

      await navigator.clipboard.writeText(url)
      toast({
        title: 'URL Copied',
        description: 'Image URL has been copied to clipboard'
      })
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy URL to clipboard',
        variant: 'destructive'
      })
    }
  }

  if (!images || images.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No images generated yet
      </div>
    )
  }

  const handleLoadMore = () => {
    setVisibleCount(prev => Math.min(prev + IMAGES_PER_PAGE, images.length))
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {visibleImages.map((image) => {
          const imageUrl = signedUrls[image.output_url]
          const isLoading = loadingImages.has(imageUrl)
          const isPreviewLoading = previewLoading[image.id]

          return (
            <div key={image.id} className="group relative">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted relative">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt="Generated"
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    className={`object-cover transition-opacity duration-200 ${
                      isLoading ? 'opacity-50' : 'opacity-100'
                    }`}
                    placeholder="blur"
                    blurDataURL={BLUR_PLACEHOLDER}
                    priority={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}
                
                {/* Loading overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1">
                <Dialog
                  onOpenChange={async (open) => {
                    if (open) {
                      try {
                        setPreviewLoading(prev => ({ ...prev, [image.id]: true }))
                        await ensureSignedUrl(image.output_url)
                      } catch {
                        setPreviewLoading(prev => ({ ...prev, [image.id]: false }))
                      }
                    } else {
                      setPreviewLoading(prev => {
                        const nextState = { ...prev }
                        delete nextState[image.id]
                        return nextState
                      })
                    }
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary">
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>View full size</TooltipContent>
                  </Tooltip>

                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Generated Image</DialogTitle>
                    </DialogHeader>
                    <div className="flex justify-center">
                      <div className="relative max-w-full max-h-[80vh]">
                        {isPreviewLoading && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                          </div>
                        )}
                        {signedUrls[image.output_url] ? (
                          <Image
                            src={signedUrls[image.output_url]}
                            alt="Generated"
                            width={1600}
                            height={1600}
                            className="max-w-full max-h-[80vh] object-contain rounded-lg"
                            loading="lazy"
                            placeholder="blur"
                            blurDataURL={BLUR_PLACEHOLDER}
                            onLoadingComplete={() =>
                              setPreviewLoading(prev => ({ ...prev, [image.id]: false }))
                            }
                          />
                        ) : (
                          <div className="flex h-[60vh] w-[60vw] items-center justify-center">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyUrl(image)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy URL</TooltipContent>
                </Tooltip>
              </div>
            </div>
        )
        })}
      </div>
      {hasMoreImages && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={handleLoadMore}>
            Load more images
          </Button>
        </div>
      )}
    </TooltipProvider>
  )
}
