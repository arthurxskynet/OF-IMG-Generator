'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GeneratedImage } from '@/types/jobs'
import { useToast } from '@/hooks/use-toast'
import { Copy, Maximize2, ImageIcon } from 'lucide-react'
import { useThumbnailLoader } from '@/hooks/use-thumbnail-loader'
import { getSignedUrl } from '@/lib/jobs'

interface ImageGalleryProps {
  images: GeneratedImage[]
  getSignedUrl: (path: string) => Promise<string>
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const INTERNAL_IMAGE_MIME = 'application/x-ai-studio-image'
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
        if (response) {
          url = response.url
        }
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
  
  const handleCopyPrompt = async (promptText: string) => {
    try {
      await navigator.clipboard.writeText(promptText)
      toast({
        title: 'Prompt Copied',
        description: 'Prompt has been copied to clipboard'
      })
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy prompt to clipboard',
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
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <div className="rounded-full bg-muted p-4 mb-3">
          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium">No images generated yet</p>
        <p className="text-xs mt-1 text-muted-foreground/70">Start generating to see your images here</p>
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
              <div 
                className="aspect-square rounded-xl overflow-hidden bg-muted relative border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                draggable
                onDragStart={(e) => {
                  try {
                    const payload = {
                      kind: 'generated-image',
                      imageId: image.id,
                      outputPath: image.output_url,
                      thumbnailPath: image.thumbnail_url || null,
                      sourceRowId: ''
                    }
                    e.dataTransfer.setData(INTERNAL_IMAGE_MIME, JSON.stringify(payload))
                    // Fallback text/plain for browsers that strip custom types
                    e.dataTransfer.setData('text/plain', JSON.stringify(payload))
                    e.dataTransfer.effectAllowed = 'copy'
                  } catch {}
                }}
              >
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt="Generated"
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                    className={`object-cover transition-all duration-300 group-hover:scale-105 ${
                      isLoading ? 'opacity-50' : 'opacity-100'
                    }`}
                    priority={false}
                    onError={async (e) => {
                      const path = image.thumbnail_url || image.output_url
                      if (!path) return
                      try {
                        const response = await getSignedUrl(path)
                        if (response) {
                          const el = e.currentTarget as HTMLImageElement
                          el.src = response.url
                        }
                      } catch {}
                    }}
                    data-image-path={image.thumbnail_url || image.output_url}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                  </div>
                )}
                
                {/* Loading overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                  </div>
                )}
              </div>
              
              {/* Hover overlay with gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/60 to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2 rounded-xl">
                <Dialog onOpenChange={(open) => open && handleDialogOpen(image.id)}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary" className="backdrop-blur-sm bg-white/20 hover:bg-white/30 text-white border-white/20 shadow-lg">
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>View full size</TooltipContent>
                  </Tooltip>
                  
                  <DialogContent className="max-w-5xl">
                    <DialogHeader className="pb-4">
                      <DialogTitle className="text-xl font-semibold">Generated Image</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="flex justify-center bg-muted/30 rounded-xl p-4">
                        {isLoadingFull(image.id) ? (
                          <div className="flex flex-col items-center justify-center h-[70vh] gap-3">
                            <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent"></div>
                            <p className="text-sm text-muted-foreground">Loading full resolution...</p>
                          </div>
                        ) : (
                          <Image
                            src={fullUrls[image.id] || thumbnailUrl || ''}
                            alt="Generated"
                            width={1600}
                            height={1600}
                            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                            loading="lazy"
                            priority={false}
                            onError={async (e) => {
                              const path = image.output_url || image.thumbnail_url
                              if (!path) return
                              try {
                                const response = await getSignedUrl(path)
                                if (response) {
                                  const el = e.currentTarget as HTMLImageElement
                                  el.src = response.url
                                }
                              } catch {}
                            }}
                            data-image-path={image.output_url || image.thumbnail_url || ''}
                          />
                        )}
                      </div>
                      
                      {/* Prompt Display */}
                      {image.prompt_text && (
                        <div className="border border-border/50 rounded-xl p-5 bg-gradient-to-br from-muted/50 to-muted/30 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-foreground">Prompt Used</h4>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyPrompt(image.prompt_text!)}
                              className="h-8 px-3 text-xs"
                            >
                              <Copy className="h-3 w-3 mr-1.5" />
                              Copy
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono bg-background/50 p-3 rounded-md border border-border/30">
                            {image.prompt_text}
                          </p>
                        </div>
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
                      className="backdrop-blur-sm bg-white/20 hover:bg-white/30 text-white border-white/20 shadow-lg"
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
