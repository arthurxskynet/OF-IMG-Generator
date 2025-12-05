'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useVariantsStore } from '@/store/variants-store'
import { VariantPromptEnhanceDialog } from '@/components/variants/variant-prompt-enhance-dialog'
import { getSignedUrl } from '@/lib/jobs'
import { Wand2, Sparkles, Copy, Trash2, Upload, X, AlertCircle } from 'lucide-react'

const MAX_IMAGES = 8
const INTERNAL_IMAGE_MIME = 'application/x-ai-studio-image'

export function VariantsWorkspace() {
  const { toast } = useToast()
  const { images, prompt, addImages, removeImage, clearImages, setPrompt } = useVariantsStore()
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})

  // Load thumbnail URLs
  const loadThumbnail = useCallback(async (imageId: string, path: string) => {
    try {
      const response = await getSignedUrl(path)
      if (response) {
        setThumbnailUrls(prev => ({ ...prev, [imageId]: response.url }))
      }
    } catch (error) {
      console.error('Failed to load thumbnail:', error)
    }
  }, [])

  // Load thumbnails on mount and when images change
  useEffect(() => {
    images.forEach(img => {
      const path = img.thumbnailPath || img.outputPath
      if (path && !thumbnailUrls[img.id]) {
        loadThumbnail(img.id, path)
      }
    })
  }, [images, thumbnailUrls, loadThumbnail])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    try {
      // Check for internal drag-and-drop from model workspace
      const internalData = e.dataTransfer.getData(INTERNAL_IMAGE_MIME) || 
                          e.dataTransfer.getData('text/plain')
      
      if (internalData) {
        try {
          const payload = JSON.parse(internalData)
          if (payload.kind === 'generated-image') {
            if (images.length >= MAX_IMAGES) {
              toast({
                title: 'Maximum images reached',
                description: `You can add up to ${MAX_IMAGES} images to variants`,
                variant: 'destructive'
              })
              return
            }

            addImages([{
              id: payload.imageId,
              outputPath: payload.outputPath,
              thumbnailPath: payload.thumbnailPath,
              sourceRowId: payload.sourceRowId
            }])

            toast({
              title: 'Image added',
              description: 'Image added to variants workspace'
            })
            return
          }
        } catch {}
      }

      // Handle file uploads (optional)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        toast({
          title: 'File upload not supported',
          description: 'Please add images from the Models workspace',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Drop error:', error)
      toast({
        title: 'Drop failed',
        description: 'Could not add image to variants',
        variant: 'destructive'
      })
    }
  }, [images.length, addImages, toast])

  const handleGeneratePrompt = async () => {
    if (images.length === 0) {
      toast({
        title: 'No images',
        description: 'Add images to generate a prompt',
        variant: 'destructive'
      })
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/variants/prompt/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePaths: images.map(img => img.outputPath)
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate prompt')
      }

      const data = await response.json()
      setPrompt(data.prompt)

      toast({
        title: 'Prompt generated',
        description: 'Variant prompt created successfully'
      })
    } catch (error) {
      console.error('Generate prompt error:', error)
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Could not generate prompt',
        variant: 'destructive'
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyPrompt = () => {
    if (!prompt) return
    navigator.clipboard.writeText(prompt)
    toast({
      title: 'Copied',
      description: 'Prompt copied to clipboard'
    })
  }

  const handleClearAll = () => {
    clearImages()
    toast({
      title: 'Cleared',
      description: 'All images and prompt cleared'
    })
  }

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card>
        <CardContent className="p-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Add up to {MAX_IMAGES} images from the Models workspace to create variant prompts. 
              Drag images here or use the &quot;Add to Variants&quot; button in the Models page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Images Grid */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Images ({images.length}/{MAX_IMAGES})</h2>
            {images.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {/* Drop Zone */}
          <div
            className={`relative min-h-[200px] rounded-lg border-2 border-dashed transition-all ${
              isDragging
                ? 'border-primary bg-primary/5'
                : images.length === 0
                ? 'border-muted-foreground/25 hover:border-muted-foreground/50'
                : 'border-transparent'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-1">No images added yet</p>
                <p className="text-xs text-muted-foreground">
                  Drag images from Models workspace or use &quot;Add to Variants&quot;
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((image) => (
                  <div key={image.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted">
                    {thumbnailUrls[image.id] ? (
                      <Image
                        src={thumbnailUrls[image.id]}
                        alt="Variant"
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover"
                        onError={() => {
                          // Try to reload with the full path
                          loadThumbnail(image.id, image.outputPath)
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    )}
                    
                    {/* Remove button */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeImage(image.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Prompt Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Variant Prompt</h2>
              <div className="flex gap-2">
                <Button
                  onClick={handleGeneratePrompt}
                  disabled={isGenerating || images.length === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {isGenerating ? (
                    <>
                      <Spinner size="sm" />
                      <span className="ml-2">Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Create Variant Prompt
                    </>
                  )}
                </Button>
                {prompt && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setEnhanceDialogOpen(true)}
                      disabled={isGenerating}
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Enhance
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCopyPrompt}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {prompt ? (
              <div className="space-y-2">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="resize-y font-mono text-sm"
                  placeholder="Generated prompt will appear here..."
                />
                {prompt.split(/\s+/).length >= 50 && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <span className="font-medium">✓ Seedream v4 ready</span>
                    <span className="text-muted-foreground">({prompt.split(/\s+/).length} words)</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground text-center">
                No prompt generated yet. Add images and click &quot;Create Variant Prompt&quot; to generate.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enhance Dialog */}
      <VariantPromptEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={setEnhanceDialogOpen}
        currentPrompt={prompt || ''}
        onPromptUpdated={setPrompt}
        imagePaths={images.map(img => img.outputPath)}
      />
    </div>
  )
}

