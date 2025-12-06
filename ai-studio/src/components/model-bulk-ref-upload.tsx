'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { uploadImage, validateFile } from '@/lib/client-upload'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase-browser'
import { Upload, X, ImageIcon } from 'lucide-react'
import { Model } from '@/types/jobs'

interface ModelBulkRefUploadProps {
  model: Model
  onUpdate?: () => void
}

export function ModelBulkRefUpload({ model, onUpdate }: ModelBulkRefUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const supabase = createClient()

  // Load existing default images as previews
  useEffect(() => {
    const loadExistingImages = async () => {
      const defaultRefs = model.default_ref_headshot_urls && model.default_ref_headshot_urls.length > 0
        ? model.default_ref_headshot_urls
        : model.default_ref_headshot_url
          ? [model.default_ref_headshot_url]
          : []

      if (defaultRefs.length === 0) {
        return
      }

      try {
        // Get signed URLs for existing images
        const signedUrls = await Promise.all(
          defaultRefs.map(async (path) => {
            try {
              const { data } = await supabase.storage
                .from('refs')
                .createSignedUrl(path, 3600)
              return data?.signedUrl || ''
            } catch {
              return ''
            }
          })
        )

        setPreviews(signedUrls.filter(Boolean))
        setUploadedImages(defaultRefs.filter(Boolean))
      } catch (error) {
        console.error('Failed to load existing images:', error)
      }
    }

    loadExistingImages()
  }, [model.default_ref_headshot_urls, model.default_ref_headshot_url])

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to upload images',
        variant: 'destructive'
      })
      return
    }

    const fileArray = Array.from(files)
    const newPreviews: string[] = []
    const uploadPromises: Promise<{ objectPath: string }>[] = []

    // Validate all files first
    for (const file of fileArray) {
      try {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 50)
        const previewUrl = URL.createObjectURL(file)
        newPreviews.push(previewUrl)
        uploadPromises.push(uploadImage(file, 'refs', user.id))
      } catch (error) {
        toast({
          title: 'Invalid file',
          description: error instanceof Error ? error.message : 'One or more files are invalid',
          variant: 'destructive'
        })
        // Clean up previews on error
        newPreviews.forEach(url => URL.revokeObjectURL(url))
        return
      }
    }

    setIsUploading(true)

    try {
      // Upload all files in parallel
      const results = await Promise.all(uploadPromises)
      const newPaths = results.map(r => r.objectPath)
      const updatedImages = [...uploadedImages, ...newPaths]
      
      // Show all previews
      setPreviews(prev => [...prev, ...newPreviews])
      setUploadedImages(updatedImages)

      // Update model with new default reference images
      const response = await fetch(`/api/models/${model.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_ref_headshot_urls: updatedImages
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update model')
      }

      toast({
        title: 'Images uploaded',
        description: `${fileArray.length} image${fileArray.length > 1 ? 's' : ''} added to default references`
      })

      // Trigger refresh if callback provided
      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload images',
        variant: 'destructive'
      })
      // Clean up previews on error
      newPreviews.forEach(url => URL.revokeObjectURL(url))
      setPreviews(prev => prev.slice(0, prev.length - newPreviews.length))
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeImage = async (index: number) => {
    const updatedImages = uploadedImages.filter((_, i) => i !== index)
    const previewToRevoke = previews[index]
    if (previewToRevoke) {
      URL.revokeObjectURL(previewToRevoke)
    }
    setPreviews(prev => prev.filter((_, i) => i !== index))
    setUploadedImages(updatedImages)

    try {
      // Update model with removed image
      const response = await fetch(`/api/models/${model.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_ref_headshot_urls: updatedImages
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update model')
      }

      toast({
        title: 'Image removed',
        description: 'Default reference image removed'
      })

      // Trigger refresh if callback provided
      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      console.error('Remove error:', error)
      toast({
        title: 'Failed to remove',
        description: error instanceof Error ? error.message : 'Failed to remove image',
        variant: 'destructive'
      })
      // Revert on error
      setPreviews(prev => [...prev, previewToRevoke])
      setUploadedImages([...updatedImages, uploadedImages[index]])
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Default Reference Images</Label>
            <p className="text-sm text-muted-foreground mt-1">
              These images will be used as default reference images when creating new rows. 
              You can override them per row if needed.
            </p>
          </div>

          {previews.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                    {preview ? (
                      <img 
                        src={preview} 
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? 'Uploading...' : previews.length === 0 ? 'Upload Reference Images' : 'Add More Images'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              JPEG, PNG, WebP up to 50MB each. You can select multiple images.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  )
}

