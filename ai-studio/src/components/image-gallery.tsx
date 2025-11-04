'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GeneratedImage } from '@/types/jobs'
import { useToast } from '@/hooks/use-toast'
import { Copy, Maximize2 } from 'lucide-react'
import { useThumbnailLoader } from '@/hooks/use-thumbnail-loader'
import { getSignedUrl } from '@/lib/jobs'

interface ImageGalleryProps {
  images: GeneratedImage[]
  getSignedUrl: (path: string) => Promise<string>
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const { toast } = useToast()
  const { thumbnailUrls, fullUrls, loadFullImage, isLoadingFull } = useThumbnailLoader(images)
  const [dialogImageId, setDialogImageId] = useState<string | null>(null)

  const handleCopyUrl = async (image: GeneratedImage) => {
    try {
      // For copying, we always want the actual signed Supabase URL (not proxy URL)
      // Proxy URLs are only for display/optimization - sharing needs direct Supabase URLs
      let url = ''
      
      try {
        const response = await getSignedUrl(image.output_url)
        url = response.url
      } catch (error) {
        console.error('Failed to get signed URL for copying:', error)
        toast({
          title: 'Copy Failed',
          description: 'Failed to generate image URL',
          variant: 'destructive'
        })
        return
      }
      
      if (!url) {
        toast({
          title: 'Copy Failed',
          description: 'No URL available',
          variant: 'destructive'
        })
        return
      }
      
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
  
  const handleDialogOpen = async (imageId: string) => {
    setDialogImageId(imageId)
    // Load full resolution when dialog opens
    await loadFullImage(imageId)
  }

  if (!images || images.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No images generated yet
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {images.map((image) => {
          const thumbnailUrl = thumbnailUrls[image.id]
          const isLoading = !thumbnailUrl
          
          return (
            <div key={image.id} className="group relative">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted relative">
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt="Generated"
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    className={`object-cover transition-opacity duration-200 ${
                      isLoading ? 'opacity-50' : 'opacity-100'
                    }`}
                    priority={false}
                    onError={async (e) => {
                      const path = image.thumbnail_url || image.output_url
                      if (!path) return
                      try {
                        const response = await getSignedUrl(path)
                        const el = e.currentTarget as HTMLImageElement
                        el.src = response.url
                      } catch {}
                    }}
                    data-image-path={image.thumbnail_url || image.output_url}
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
                <Dialog onOpenChange={(open) => open && handleDialogOpen(image.id)}>
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
                      {isLoadingFull(image.id) ? (
                        <div className="flex items-center justify-center h-[80vh]">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        </div>
                      ) : (
                        <Image
                          src={fullUrls[image.id] || thumbnailUrl || ''}
                          alt="Generated"
                          width={1600}
                          height={1600}
                          className="max-w-full max-h-[80vh] object-contain rounded-lg"
                          loading="lazy"
                          priority={false}
                          onError={async (e) => {
                            const path = image.output_url || image.thumbnail_url
                            if (!path) return
                            try {
                              const response = await getSignedUrl(path)
                              const el = e.currentTarget as HTMLImageElement
                              el.src = response.url
                            } catch {}
                          }}
                          data-image-path={image.output_url || image.thumbnail_url || ''}
                        />
                      )}
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
    </TooltipProvider>
  )
}
