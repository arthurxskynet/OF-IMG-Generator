'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { VariantRow, VariantRowImage } from '@/types/variants'
import { getSignedUrl } from '@/lib/jobs'
import { Wand2, Sparkles, Copy, Trash2, Plus, X, AlertCircle, Play, Eye, EyeOff, ChevronDown, ChevronUp, Star, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useJobPolling } from '@/hooks/use-job-polling'
import { createClient } from '@/lib/supabase-browser'
import { VariantsDimensionControls } from './variants-dimension-controls'
import { useThumbnailLoader } from '@/hooks/use-thumbnail-loader'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface VariantsRowsWorkspaceProps {
  initialRows: VariantRow[]
}

const INTERNAL_IMAGE_MIME = 'application/x-ai-studio-image'

// Preset enhancement chips for quick access - organized by category
const PRESET_ENHANCEMENTS = {
  quality: [
    { label: '✨ Professional studio', value: 'Enhance to professional studio quality with polished lighting and clean composition' },
    { label: '📸 Casual snapshot', value: 'Make it look like a casual low-effort snapshot with natural imperfections, amateur lighting, and everyday quality' },
    { label: '🎥 Film grain', value: 'Add film grain texture and slightly reduced sharpness for analog film aesthetic' }
  ],
  lighting: [
    { label: '🔥 Dramatic lighting', value: 'Make lighting more dramatic with high contrast, bold shadows, and striking directional light' },
    { label: '🌅 Golden hour', value: 'Add golden hour sunset atmosphere with warm amber tones and soft natural lighting' },
    { label: '💡 Harsh overhead', value: 'Change to harsh overhead lighting with unflattering shadows, typical of casual indoor photos' },
    { label: '🌙 Low light', value: 'Simulate low light conditions with increased grain, softer details, and dim ambient lighting' }
  ],
  motion: [
    { label: '💨 Motion blur', value: 'Add slight motion blur suggesting movement, with subtle streaking effect as if captured mid-action' },
    { label: '🎯 Tack sharp', value: 'Ensure perfectly sharp focus with crystal clear details throughout' }
  ],
  gaze: [
    { label: '👈 Look left', value: 'Have subject looking to the left side, gaze directed away from camera' },
    { label: '👉 Look right', value: 'Have subject looking to the right side, gaze directed away from camera' },
    { label: '👁️ Camera gaze', value: 'Subject looking directly at camera with engaged eye contact' },
    { label: '👇 Look down', value: 'Subject looking downward with contemplative gaze' }
  ],
  expression: [
    { label: '😊 Smiling', value: 'Add genuine smiling expression with warm, happy demeanor' },
    { label: '😢 Sad', value: 'Change to sad, melancholic expression with downcast mood' },
    { label: '😗 Pouting', value: 'Add playful pouting expression with pursed lips' },
    { label: '😐 Neutral', value: 'Keep neutral, serious expression with calm composure' },
    { label: '😮 Surprised', value: 'Show surprised, animated expression with wide-eyed look' },
    { label: '💪 Confident pose', value: 'Add confident, powerful posing with strong body language' }
  ],
  color: [
    { label: '🎨 Muted palette', value: 'Use muted earth tone color palette with desaturated, sophisticated colors' },
    { label: '🌈 Vibrant colors', value: 'Increase color vibrancy and saturation for bold, eye-catching palette' },
    { label: '⚫ Monochrome', value: 'Convert to black and white monochrome with strong tonal contrast' }
  ],
  depth: [
    { label: '📷 Shallow DOF', value: 'Add shallow depth of field with blurred background for subject isolation' },
    { label: '🌄 Deep focus', value: 'Use deep depth of field with sharp focus throughout entire scene' }
  ]
}

export function VariantsRowsWorkspace({ initialRows }: VariantsRowsWorkspaceProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [generatingPromptRowId, setGeneratingPromptRowId] = useState<string | null>(null)
  const [generatingQuickRowId, setGeneratingQuickRowId] = useState<string | null>(null)
  const [enhancingRowId, setEnhancingRowId] = useState<string | null>(null)
  const [enhanceInstructions, setEnhanceInstructions] = useState<Record<string, string>>({})
  const [selectedPresets, setSelectedPresets] = useState<Record<string, string[]>>({})
  const [showCompareView, setShowCompareView] = useState<Record<string, boolean>>({})
  const [originalPrompts, setOriginalPrompts] = useState<Record<string, string>>({})
  const [generatingImageRowId, setGeneratingImageRowId] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [favoritesState, setFavoritesState] = useState<Record<string, boolean>>({})
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    rowId: string | null;
    imageIndex: number;
  }>({ isOpen: false, rowId: null, imageIndex: 0 })
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})
  const loadingImagesRef = useRef<Set<string>>(new Set())
  const { startPolling, pollingState } = useJobPolling(() => {
    // Refresh on completion
    setTimeout(() => {
      router.refresh()
    }, 300)
  })
  const supabase = createClient()

  // Collect all generated images for thumbnail loader
  // Defensive filtering: only images with is_generated === true (explicit check)
  const allGeneratedImages = rows.flatMap(row => {
    const allImages = row.variant_row_images || []
    return allImages
      .filter(img => {
        // Strict check: only include images explicitly marked as generated
        // Handle null, undefined, false, and any other falsy values as reference images
        return img.is_generated === true
      })
      .map(img => ({
        id: img.id,
        output_url: img.output_path,
        thumbnail_url: img.thumbnail_path || null,
        is_favorited: img.is_favorited || false,
        created_at: img.created_at || new Date().toISOString()
      }))
  })

  // Use thumbnail loader hook for all generated images
  const { thumbnailUrls: loaderThumbnailUrls, fullUrls, loadFullImage } = useThumbnailLoader(allGeneratedImages)

  // Merge loader thumbnails with manually loaded ones
  useEffect(() => {
    setThumbnailUrls(prev => ({ ...prev, ...loaderThumbnailUrls }))
  }, [loaderThumbnailUrls])

  // Initialize favorites state from data when component loads
  useEffect(() => {
    const initialFavorites: Record<string, boolean> = {}
    rows.forEach(row => {
      const allImages = row.variant_row_images || []
      // Defensive filtering: only images with is_generated === true
      const generatedImages = allImages.filter(img => {
        // Strict check: only include images explicitly marked as generated
        // Exclude null, undefined, false, and any other falsy values
        return img.is_generated === true
      })
      generatedImages.forEach(img => {
        const isFav = img.is_favorited === true
        initialFavorites[img.id] = isFav
      })
    })
    setFavoritesState(initialFavorites)
  }, [rows])

  // Helper function to get current favorite status (prioritizes UI state over data state)
  const getCurrentFavoriteStatus = (imageId: string, dataStatus?: boolean) => {
    if (favoritesState[imageId] !== undefined) {
      return favoritesState[imageId]
    }
    return dataStatus === true
  }

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(async (imageId: string, currentStatus: boolean | undefined) => {
    try {
      const newStatus = currentStatus === true ? false : true
      
      // Immediately update the UI state for instant feedback
      setFavoritesState(prev => ({
        ...prev,
        [imageId]: newStatus
      }))
      
      const response = await fetch(`/api/images/${imageId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorited: newStatus })
      })

      if (response.ok) {
        const { is_favorited } = await response.json()
        
        // Update the main rows state to keep it in sync
        setRows(prev => prev.map(row => {
          const updatedImages = row.variant_row_images?.map((img: any) => {
            if (img.id === imageId) {
              return { ...img, is_favorited }
            }
            return img
          }) || []
          
          return {
            ...row,
            variant_row_images: updatedImages
          }
        }))

        toast({
          title: is_favorited ? 'Added to favorites' : 'Removed from favorites',
          description: is_favorited ? 'Image marked as favorite' : 'Image removed from favorites'
        })
      } else {
        // Revert the UI state if API call failed
        setFavoritesState(prev => ({
          ...prev,
          [imageId]: currentStatus === true ? true : false
        }))
        
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update favorite status')
      }
    } catch (error) {
      // Revert the UI state if there was an error
      setFavoritesState(prev => ({
        ...prev,
        [imageId]: currentStatus === true ? true : false
      }))
      
      toast({
        title: 'Failed to update favorite',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }, [toast])

  // Navigation handlers for image dialog
  const handleNavigateImage = useCallback(async (direction: 'prev' | 'next') => {
    setDialogState(prev => {
      if (!prev.rowId) return prev
      
      const currentRow = rows.find(row => row.id === prev.rowId)
      if (!currentRow) return prev
      
            const allImages = currentRow.variant_row_images || []
            // Defensive filtering: only images with is_generated === true
            const generatedImages = allImages.filter(img => {
              // Strict check: only include images explicitly marked as generated
              // Exclude null, undefined, false, and any other falsy values
              return img.is_generated === true
            })
      
      const newIndex = direction === 'prev' 
        ? Math.max(0, prev.imageIndex - 1)
        : Math.min(generatedImages.length - 1, prev.imageIndex + 1)
      
      // Load full resolution for new image
      const newImage = generatedImages[newIndex]
      if (newImage) {
        loadFullImage(newImage.id).catch(() => {})
      }
      
      return { ...prev, imageIndex: newIndex }
    })
  }, [rows, loadFullImage])

  // Handle keyboard navigation in dialog
  useEffect(() => {
    if (!dialogState.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleNavigateImage('prev')
      } else if (e.key === 'ArrowRight') {
        handleNavigateImage('next')
      } else if (e.key === 'Escape') {
        setDialogState({ isOpen: false, rowId: null, imageIndex: 0 })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogState.isOpen, handleNavigateImage])

  // Load thumbnail URLs
  const loadThumbnail = useCallback(async (imageId: string, path: string) => {
    if (!path) {
      console.warn(`[Variants] No path provided for image ${imageId}`)
      return
    }

    // Skip if already loading or loaded
    if (loadingImagesRef.current.has(imageId) || thumbnailUrls[imageId]) {
      return
    }

    loadingImagesRef.current.add(imageId)

    try {
      console.log(`[Variants] Loading thumbnail for image ${imageId}`, { path })
      const response = await getSignedUrl(path)
      if (response?.url) {
        setThumbnailUrls(prev => ({ ...prev, [imageId]: response.url }))
        console.log(`[Variants] Successfully loaded thumbnail for ${imageId}`)
      } else {
        console.warn(`[Variants] No URL returned for image ${imageId}`)
      }
    } catch (error) {
      console.error(`[Variants] Failed to load thumbnail for ${imageId}:`, error)
      // Try to load the full image as fallback if thumbnail fails
      if (path.includes('thumbnail')) {
        const fullPath = path.replace('/thumbnails/', '/').replace('thumbnail_', '')
        try {
          const fallbackResponse = await getSignedUrl(fullPath)
          if (fallbackResponse?.url) {
            setThumbnailUrls(prev => ({ ...prev, [imageId]: fallbackResponse.url }))
          }
        } catch (fallbackError) {
          console.error(`[Variants] Fallback load also failed for ${imageId}:`, fallbackError)
        }
      }
    } finally {
      loadingImagesRef.current.delete(imageId)
    }
  }, [thumbnailUrls])

  // Load thumbnails on mount and when rows change
  // Note: All images (reference and generated) are in variant_row_images, not in jobs.generated_images
  useEffect(() => {
    if (rows.length === 0) return

    const imagesToLoad: Array<{ id: string; path: string }> = []
    
    rows.forEach(row => {
      // Collect all variant row images to load (both reference and generated)
      // All images are stored in variant_row_images with is_generated flag
      row.variant_row_images?.forEach(img => {
        const path = img.thumbnail_path || img.output_path
        if (path && !thumbnailUrls[img.id] && !loadingImagesRef.current.has(img.id)) {
          imagesToLoad.push({ id: img.id, path })
        }
      })
    })

    if (imagesToLoad.length > 0) {
      console.log(`[Variants] Loading ${imagesToLoad.length} thumbnails`)
      // Load all images
      imagesToLoad.forEach(({ id, path }) => {
        loadThumbnail(id, path)
      })
    }
  }, [rows, thumbnailUrls, loadThumbnail])

  // Resume polling for active variant jobs on mount + realtime subscription
  useEffect(() => {
    let cancelled = false
    
    const fetchActiveVariantJobs = async () => {
      try {
        const res = await fetch('/api/variants/jobs/active', {
          method: 'GET',
          cache: 'no-store'
        })
        if (!res.ok) return
        const data = await res.json()
        const activeJobs = data.jobs || []
        
        if (cancelled) return
        
        for (const j of activeJobs) {
          startPolling(j.job_id, j.status, j.variant_row_id)
        }
        
        console.log('[Variants] Resumed polling for active jobs', { count: activeJobs.length })
      } catch (error) {
        console.error('[Variants] Failed to fetch active jobs:', error)
      }
    }
    
    fetchActiveVariantJobs()
    
    // Realtime subscription to jobs updates for variant rows
    try {
      const jobsChannel = supabase.channel('variant-jobs')
      jobsChannel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `variant_row_id=neq.null`
      }, (payload: any) => {
        const next = payload?.new
        if (!next || !next.variant_row_id) return
        const s = String(next.status)
        if (['queued','submitted','running','saving'].includes(s)) {
          startPolling(String(next.id), s, String(next.variant_row_id))
        }
        if (['succeeded','failed'].includes(s)) {
          // Refresh after a short delay to allow database to complete image insertion
          setTimeout(() => {
            router.refresh()
          }, 500)
        }
      })
      .subscribe()
      ;(window as any).__variantJobsRealtime = jobsChannel
      
      // Realtime subscription to variant_row_images updates
      // This ensures UI updates immediately when new generated images are inserted
      const imagesChannel = supabase.channel('variant-row-images')
      imagesChannel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.true`
      }, (payload: any) => {
        const newImage = payload?.new
        if (!newImage || !newImage.variant_row_id) return
        
        console.log('[Variants] New generated image inserted via realtime', {
          imageId: newImage.id,
          variantRowId: newImage.variant_row_id,
          isGenerated: newImage.is_generated
        })
        
        // Refresh to show new image
        // Use a small delay to ensure the image is fully committed
        setTimeout(() => {
          router.refresh()
        }, 300)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.true`
      }, (payload: any) => {
        const updatedImage = payload?.new
        if (!updatedImage || !updatedImage.variant_row_id) return
        
        console.log('[Variants] Generated image updated via realtime', {
          imageId: updatedImage.id,
          variantRowId: updatedImage.variant_row_id
        })
        
        // Refresh to show updated image
        setTimeout(() => {
          router.refresh()
        }, 200)
      })
      .subscribe()
      ;(window as any).__variantImagesRealtime = imagesChannel
      
      console.log('[Variants] Realtime subscriptions established', {
        jobsChannel: 'variant-jobs',
        imagesChannel: 'variant-row-images'
      })
    } catch (error) {
      console.error('[Variants] Failed to setup realtime:', error)
    }
    
    return () => {
      cancelled = true
      try {
        if ((window as any).__variantJobsRealtime) {
          supabase.removeChannel((window as any).__variantJobsRealtime)
          ;(window as any).__variantJobsRealtime = null
        }
        if ((window as any).__variantImagesRealtime) {
          supabase.removeChannel((window as any).__variantImagesRealtime)
          ;(window as any).__variantImagesRealtime = null
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper to get live status for a row from polling state
  const getLiveStatusForRow = (rowId: string) => {
    const live = Object.values(pollingState).find(s => s.rowId === rowId && s.polling)
    if (!live) return null
    return live.status
  }

  // Helper to get live polling state for a row (includes queue position)
  const getLivePollingState = (rowId: string) => {
    return Object.values(pollingState).find(s => s.rowId === rowId && s.polling) || null
  }

  // Helper to get status label
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'queued': return 'Queued'
      case 'submitted': return 'Submitted'
      case 'running': return 'Processing'
      case 'saving': return 'Saving'
      case 'succeeded': return 'Complete'
      case 'failed': return 'Failed'
      default: return status
    }
  }

  // Helper to get status color (for Badge variant)
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'queued': return 'secondary'
      case 'submitted': return 'default'
      case 'running': return 'default'
      case 'saving': return 'default'
      case 'succeeded': return 'default'
      case 'failed': return 'destructive'
      default: return 'secondary'
    }
  }

  // Helper to get status color class (for legacy div styling)
  const getStatusColorClass = (status: string): string => {
    switch (status) {
      case 'queued': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'submitted': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'running': return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'saving': return 'text-indigo-600 bg-indigo-50 border-indigo-200'
      case 'succeeded': return 'text-green-600 bg-green-50 border-green-200'
      case 'failed': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  // Helper to check if status is active (generating)
  const isActiveStatus = (status: string | null): boolean => {
    if (!status) return false
    return ['queued', 'submitted', 'running', 'saving'].includes(status)
  }

  // Helper to convert status to progress percentage
  const statusToProgress = (status: string | null): number => {
    if (!status) return 0
    switch (status) {
      case 'queued': return 10
      case 'submitted': return 25
      case 'running': return 60
      case 'saving': return 90
      case 'succeeded': return 100
      case 'failed': return 0
      default: return 0
    }
  }

  const handleAddRow = async () => {
    try {
      const response = await fetch('/api/variants/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        throw new Error('Failed to create row')
      }

      const { row } = await response.json()
      setRows(prev => [row, ...prev])
      
      toast({
        title: 'Row created',
        description: 'New variant row added'
      })
    } catch (error) {
      toast({
        title: 'Failed to create row',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  const handleGeneratePrompt = async (rowId: string) => {
    setGeneratingPromptRowId(rowId)
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/prompt/generate`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate prompt')
      }

      const { prompt } = await response.json()

      // Save original prompt before overwrite (for compare view)
      const currentRow = rows.find(r => r.id === rowId)
      if (currentRow?.prompt && !originalPrompts[rowId]) {
        setOriginalPrompts(prev => ({ ...prev, [rowId]: currentRow.prompt! }))
      }

      setRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, prompt } : r
      ))

      toast({
        title: 'Prompt generated',
        description: 'Variant prompt created from your reference images'
      })
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setGeneratingPromptRowId(null)
    }
  }

  const handleDeleteRow = async (rowId: string) => {
    try {
      const response = await fetch(`/api/variants/rows/${rowId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete row')
      }

      setRows(prev => prev.filter(r => r.id !== rowId))
      
      toast({
        title: 'Row deleted',
        description: 'Variant row removed'
      })
    } catch (error) {
      toast({
        title: 'Failed to delete row',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteImage = async (rowId: string, imageId: string) => {
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/images/${imageId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete image')
      }

      setRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            variant_row_images: row.variant_row_images?.filter(img => img.id !== imageId)
          }
        }
        return row
      }))
      
      toast({
        title: 'Image removed',
        description: 'Image deleted from variant row'
      })
    } catch (error) {
      toast({
        title: 'Failed to delete image',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  const handleGenerateVariant = async (rowId: string) => {
    setGeneratingQuickRowId(rowId)
    
    const row = rows.find(r => r.id === rowId)
    if (!row?.variant_row_images || row.variant_row_images.length < 1) {
      toast({
        title: 'Add an image',
        description: 'Seedream edit supports target-only. Add at least one image to proceed.',
        variant: 'destructive'
      })
      setGeneratingQuickRowId(null)
      return
    }
    
    try {
      // Directly generate variant image using image model (bypassing LLM prompt generation)
      const response = await fetch(`/api/variants/rows/${rowId}/generate-direct`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate variant')
      }

      const { jobId } = await response.json()
      if (jobId) startPolling(jobId, 'queued', rowId)
      
      toast({
        title: 'Variant generation started',
        description: 'Creating random variation of your images'
      })

      // Refresh to show new results after job is created
      // The realtime subscription will handle updates when images are inserted
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setGeneratingQuickRowId(null)
    }
  }

  const handleEnhancePrompt = async (rowId: string) => {
    const instructions = enhanceInstructions[rowId]
    if (!instructions?.trim()) {
      toast({
        title: 'Instructions required',
        description: 'Enter enhancement instructions',
        variant: 'destructive'
      })
      return
    }

    const row = rows.find(r => r.id === rowId)
    if (!row?.prompt) {
      toast({
        title: 'No prompt to enhance',
        description: 'Generate a prompt first',
        variant: 'destructive'
      })
      return
    }

    setEnhancingRowId(rowId)
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/prompt/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingPrompt: row.prompt,
          userInstructions: instructions
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to enhance prompt')
      }

      const { prompt } = await response.json()
      
      setRows(prev => prev.map(r => 
        r.id === rowId ? { ...r, prompt } : r
      ))
      setEnhanceInstructions(prev => ({ ...prev, [rowId]: '' }))

      toast({
        title: 'Prompt enhanced',
        description: 'Variant prompt updated successfully'
      })
    } catch (error) {
      toast({
        title: 'Enhancement failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setEnhancingRowId(null)
    }
  }

  const handlePresetChip = (rowId: string, value: string, label: string) => {
    setSelectedPresets(prev => {
      const current = prev[rowId] || []
      const isSelected = current.includes(label)
      
      const updated = isSelected
        ? current.filter(l => l !== label)
        : [...current, label]
      
      return { ...prev, [rowId]: updated }
    })
    
    // Update instructions by combining all selected presets
    setEnhanceInstructions(prev => {
      const currentPresets = prev[rowId] || ''
      const allPresets = Object.values(PRESET_ENHANCEMENTS).flat()
      const selectedLabels = selectedPresets[rowId] || []
      
      // Toggle this value
      const isCurrentlyIncluded = currentPresets.includes(value)
      let newInstructions = ''
      
      if (isCurrentlyIncluded) {
        // Remove this instruction
        const parts = currentPresets.split('. ').filter(part => !part.includes(value))
        newInstructions = parts.join('. ')
      } else {
        // Add this instruction
        const parts = currentPresets ? currentPresets.split('. ').filter(p => p.trim()) : []
        parts.push(value)
        newInstructions = parts.join('. ')
      }
      
      return { ...prev, [rowId]: newInstructions.trim() }
    })
  }

  const toggleCompareView = (rowId: string) => {
    setShowCompareView(prev => ({ ...prev, [rowId]: !prev[rowId] }))
  }

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }
  
  const clearPresets = (rowId: string) => {
    setSelectedPresets(prev => ({ ...prev, [rowId]: [] }))
    setEnhanceInstructions(prev => ({ ...prev, [rowId]: '' }))
  }

  const handlePromptChange = (rowId: string, prompt: string) => {
    // Update local state immediately
    setRows(prev => prev.map(row => 
      row.id === rowId ? { ...row, prompt } : row
    ))

    // Clear existing timeout for this row
    if (saveTimeoutRef.current[rowId]) {
      clearTimeout(saveTimeoutRef.current[rowId])
    }

    // Debounced save to DB (waits 1 second after last keystroke)
    saveTimeoutRef.current[rowId] = setTimeout(async () => {
      try {
        const response = await fetch(`/api/variants/rows/${rowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        })
        
        if (!response.ok) {
          throw new Error('Failed to save prompt')
        }
        
        console.log('[VariantRow] Prompt auto-saved:', { rowId, promptLength: prompt.length })
      } catch (error) {
        console.error('[VariantRow] Failed to save prompt:', error)
        toast({
          title: 'Auto-save failed',
          description: 'Could not save prompt changes',
          variant: 'destructive'
        })
      }
    }, 1000)
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutRef.current).forEach(timeout => clearTimeout(timeout))
    }
  }, [])

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
    toast({
      title: 'Copied',
      description: 'Prompt copied to clipboard'
    })
  }

  const handleGenerateImages = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId)
    if (!row?.prompt) {
      toast({
        title: 'No prompt',
        description: 'Generate a prompt first',
        variant: 'destructive'
      })
      return
    }

    if (!row.variant_row_images || row.variant_row_images.length < 1) {
      toast({
        title: 'Add an image',
        description: 'Seedream edit supports target-only. Add at least one image to proceed.',
        variant: 'destructive'
      })
      return
    }

    setGeneratingImageRowId(rowId)
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/generate`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate images')
      }

      const { jobId } = await response.json()
      if (jobId) startPolling(jobId, 'queued', rowId)
      
      toast({
        title: 'Generation started',
        description: 'Your variant images are being generated'
      })

      // Refresh the page to show new results after job is created
      // The realtime subscription will handle updates when images are inserted
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setGeneratingImageRowId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Dimension Controls */}
      <VariantsDimensionControls 
        variantRows={rows} 
        onUpdate={(updatedRows) => {
          setRows(updatedRows)
          // Dimensions updated - state is already set
        }} 
      />

      {/* Add Row Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Variant Rows</h2>
        <Button onClick={handleAddRow} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Row
        </Button>
      </div>

      {/* Empty State */}
      {rows.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No variant rows yet. Add images from the Models workspace using "Add to Variants" or create an empty row to get started.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Rows Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 align-top"></TableHead>
                  <TableHead className="w-32 align-top">Reference</TableHead>
                  <TableHead className="w-[36rem] min-w-[36rem] align-top">Prompt</TableHead>
                  <TableHead className="w-28 align-top">Generate</TableHead>
                  <TableHead className="w-full align-top">Results</TableHead>
                  <TableHead className="w-16 align-top">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const allImages = row.variant_row_images || []
                  
                  // Split images: reference vs generated with defensive filtering
                  // Reference images: is_generated !== true (includes false, null, undefined, or any other value)
                  // Generated images: is_generated === true (explicit boolean true only)
                  // IMPORTANT: Only images explicitly marked with is_generated === true are results
                  
                  // Defensive check: ensure all images have is_generated property normalized
                  const normalizedImages = allImages.map(img => ({
                    ...img,
                    // Normalize: ensure is_generated is explicitly boolean
                    // If null/undefined, treat as false (reference image)
                    is_generated: img.is_generated === true
                  }))
                  
                  const referenceImages = normalizedImages.filter(img => {
                    // Strictly check: only exclude if explicitly true
                    // This ensures reference images (false, null, undefined) are included
                    return img.is_generated !== true
                  })
                  
                  const generatedImages = normalizedImages.filter(img => {
                    // Only images explicitly marked as generated (is_generated === true)
                    // Defensive: double-check it's exactly true, not truthy
                    return img.is_generated === true
                  })
                  
                  // Debug logging in development to catch any misclassification
                  if (process.env.NODE_ENV === 'development' && allImages.length > 0) {
                    const misclassified = allImages.filter(img => {
                      const isGen = img.is_generated === true
                      const isRef = img.is_generated !== true
                      return !isGen && !isRef // Should never happen, but log if it does
                    })
                    if (misclassified.length > 0) {
                      console.warn('[VariantsWorkspace] Potential misclassified images', {
                        rowId: row.id,
                        misclassifiedCount: misclassified.length,
                        misclassified: misclassified.map(img => ({
                          id: img.id,
                          is_generated: img.is_generated,
                          type: typeof img.is_generated
                        }))
                      })
                    }
                  }
                  
                  const isGenerating = generatingPromptRowId === row.id
                  const isEnhancing = enhancingRowId === row.id
                  const isGeneratingImages = generatingImageRowId === row.id
                  const isExpanded = expandedRows.has(row.id)

                  return (
                    <TableRow 
                      key={row.id} 
                      className={`transition-all duration-300 ${
                        isExpanded 
                          ? 'bg-muted/30 border-l-2 border-l-primary' 
                          : 'hover:bg-muted/10'
                      }`}
                    >
                      {/* Expand/Collapse Column */}
                      <TableCell className="align-top w-12 p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRowExpansion(row.id)}
                          className="h-7 w-7 p-0 transition-transform duration-300 hover:scale-110"
                          title={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 transition-transform duration-300" />
                          ) : (
                            <ChevronDown className="h-4 w-4 transition-transform duration-300" />
                          )}
                        </Button>
                      </TableCell>

                      {/* Reference Images Column */}
                      <TableCell className="align-top p-2">
                        <div className="flex flex-col gap-1.5">
                          {referenceImages.slice(0, isExpanded ? 4 : 2).map(image => (
                            <div key={image.id} className="group relative w-16 h-16 rounded overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow transition-all duration-200">
                              {thumbnailUrls[image.id] ? (
                                <Image
                                  src={thumbnailUrls[image.id]}
                                  alt="Reference"
                                  fill
                                  sizes="64px"
                                  className="object-cover"
                                  onError={() => loadThumbnail(image.id, image.output_path)}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                </div>
                              )}
                              <button
                                onClick={() => handleDeleteImage(row.id, image.id)}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-2.5 w-2.5 text-white" />
                              </button>
                            </div>
                          ))}
                          {referenceImages.length > (isExpanded ? 4 : 2) && (
                            <div className="text-[10px] text-muted-foreground">
                              +{referenceImages.length - (isExpanded ? 4 : 2)} more
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Prompt Column */}
                      <TableCell className="align-top p-2">
                        <div className="space-y-1.5">
                          {/* Action Buttons - Always Visible */}
                          <div className="flex gap-1 items-center flex-wrap">
                            <Button
                              onClick={() => handleGeneratePrompt(row.id)}
                              disabled={isGenerating || referenceImages.length === 0}
                              className="bg-purple-600 hover:bg-purple-700"
                              size="sm"
                              title="Analyze reference images with AI and generate a Seedream-ready prompt"
                            >
                              {isGenerating ? (
                                <Spinner size="sm" />
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Generate Prompt
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={() => handleGenerateVariant(row.id)}
                              disabled={generatingQuickRowId === row.id || isGeneratingImages || referenceImages.length < 1}
                              variant="outline"
                              size="sm"
                              title="Generate random variant image directly (no text prompt)"
                            >
                              {generatingQuickRowId === row.id ? (
                                <Spinner size="sm" />
                              ) : (
                                <>
                                  <Wand2 className="h-3 w-3 mr-1" />
                                  Quick Variant
                                </>
                              )}
                            </Button>
                            {row.prompt && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyPrompt(row.prompt!)}
                                title="Copy prompt to clipboard"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {/* Prompt Textarea - Compact when collapsed, full when expanded */}
                          <div className="space-y-1 transition-all duration-300">
                            {isExpanded && row.prompt && originalPrompts[row.id] && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleCompareView(row.id)}
                                className="h-6 px-2 text-xs"
                              >
                                {showCompareView[row.id] ? (
                                  <><EyeOff className="h-3 w-3 mr-1" />Hide original</>
                                ) : (
                                  <><Eye className="h-3 w-3 mr-1" />Compare with original</>
                                )}
                              </Button>
                            )}
                            
                            {isExpanded && showCompareView[row.id] && originalPrompts[row.id] && (
                              <div className="p-2 bg-muted/50 rounded border border-border/50 transition-all duration-300">
                                <div className="text-xs font-medium mb-1">Original:</div>
                                <div className="text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                                  {originalPrompts[row.id]}
                                </div>
                              </div>
                            )}
                            
                            <Textarea
                              value={row.prompt || ''}
                              onChange={(e) => handlePromptChange(row.id, e.target.value)}
                              placeholder="Type your variant prompt here, or click Sparkles to generate one from reference images..."
                              rows={isExpanded ? 4 : 2}
                              className={`resize-y text-xs font-mono border-2 border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 shadow-sm hover:shadow-md focus-visible:shadow-lg transition-all duration-300 ${
                                !isExpanded ? 'max-h-[60px] overflow-hidden' : ''
                              }`}
                            />
                            
                            {row.prompt && row.prompt.split(/\s+/).length >= 50 && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <span className="font-medium">✓ Seedream v4 ready</span>
                                <span className="text-muted-foreground">({row.prompt.split(/\s+/).length} words)</span>
                              </div>
                            )}
                            
                            {/* Seedream v4 ratio override */}
                            <div className="flex items-center gap-2 mt-2">
                              <Switch
                                id={`match-target-${row.id}`}
                                checked={Boolean((row as any).match_target_ratio)}
                                disabled={referenceImages.length === 0}
                                onCheckedChange={async (checked) => {
                                  // Optimistic UI update
                                  setRows(prev => prev.map(r => r.id === row.id ? { ...r, match_target_ratio: Boolean(checked) } : r))
                                  try {
                                    const res = await fetch(`/api/variants/rows/${row.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ match_target_ratio: Boolean(checked) })
                                    })
                                    if (!res.ok) {
                                      throw new Error(await res.text())
                                    }
                                  } catch (e: any) {
                                    // Revert on failure
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, match_target_ratio: !Boolean(checked) } : r))
                                    toast({
                                      title: 'Failed to update setting',
                                      description: 'Could not update match target ratio',
                                      variant: 'destructive'
                                    })
                                  }
                                }}
                              />
                              <Label htmlFor={`match-target-${row.id}`} className="text-xs text-muted-foreground cursor-pointer">
                                Match target ratio (v4)
                              </Label>
                            </div>
                          </div>

                          {/* Enhance section - only show when expanded AND prompt exists */}
                          {isExpanded && row.prompt && (
                            <div className="space-y-2.5 pt-2 border-t border-border/50 transition-all duration-300">
                              {/* Preset chips - organized by category in compact grid */}
                              <div className="space-y-2">
                                {Object.entries(PRESET_ENHANCEMENTS).map(([category, presets]) => (
                                  <div key={category} className="space-y-1">
                                    <div className="text-xs font-semibold text-muted-foreground capitalize">{category}</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {presets.map((preset) => {
                                        const isSelected = (selectedPresets[row.id] || []).includes(preset.label)
                                        return (
                                          <button
                                            key={preset.label}
                                            onClick={() => handlePresetChip(row.id, preset.value, preset.label)}
                                            className={`px-2 py-1 text-xs rounded-md transition-all duration-200 shadow-sm ${
                                              isSelected 
                                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md ring-2 ring-primary/20' 
                                                : 'bg-secondary hover:bg-secondary/80 hover:shadow'
                                            }`}
                                            title={preset.value}
                                          >
                                            {preset.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Clear selections button */}
                              {(selectedPresets[row.id]?.length || 0) > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => clearPresets(row.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Clear {selectedPresets[row.id].length} selection{selectedPresets[row.id].length > 1 ? 's' : ''}
                                </Button>
                              )}
                              
                              {/* Enhancement input */}
                              <div className="flex gap-1">
                                <Textarea
                                  value={enhanceInstructions[row.id] || ''}
                                  onChange={(e) => setEnhanceInstructions(prev => ({ ...prev, [row.id]: e.target.value }))}
                                  placeholder="Combined instructions from selected presets (or type custom)..."
                                  rows={3}
                                  className="resize-y text-xs flex-1 font-mono border-2 border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 shadow-sm"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEnhancePrompt(row.id)}
                                  disabled={isEnhancing || !enhanceInstructions[row.id]?.trim()}
                                  className="self-end"
                                  title="Enhance current prompt with AI"
                                >
                                  {isEnhancing ? (
                                    <Spinner size="sm" />
                                  ) : (
                                    <Wand2 className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Generate Column */}
                      <TableCell className="align-top p-2">
                        <div className="flex flex-col gap-2">
                          {(() => {
                            const liveStatus = getLiveStatusForRow(row.id)
                            const livePolling = getLivePollingState(row.id)
                            const displayStatus = liveStatus || (isGeneratingImages ? 'queued' : null)
                            const displayProgress = statusToProgress(displayStatus)
                            const isActive = isActiveStatus(displayStatus) || isGeneratingImages
                            
                            return (
                              <>
                                <Button
                                  onClick={() => handleGenerateImages(row.id)}
                                  disabled={!row.prompt || referenceImages.length < 1 || isActive}
                                  size="sm"
                                  variant="default"
                                  aria-busy={isActive}
                                  className={`transition-all duration-300 ${
                                    !row.prompt || referenceImages.length < 1 || isActive
                                      ? 'opacity-50 cursor-not-allowed'
                                      : isActive
                                      ? 'bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20'
                                      : 'bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/90 hover:via-primary hover:to-primary shadow-md hover:shadow-lg hover:shadow-primary/30 hover:scale-105'
                                  } font-semibold`}
                                >
                                  {isActive ? (
                                    <>
                                      <Spinner 
                                        key={`spinner-${row.id}-${displayStatus}`}
                                        size="sm" 
                                        className="animate-spin" 
                                      />
                                      <span>{displayStatus ? getStatusLabel(displayStatus) : 'Generating...'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3 mr-1" />
                                      Generate
                                    </>
                                  )}
                                </Button>
                                
                                {livePolling?.queuePosition !== undefined && isActive && (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                      {livePolling.queuePosition > 0 ? `#${livePolling.queuePosition} in queue` : 'Processing...'}
                                    </span>
                                  </div>
                                )}
                                
                                {displayStatus && (
                                  <div className="flex flex-col gap-1.5 min-w-[6rem]" aria-live="polite">
                                    <Badge 
                                      variant={getStatusColor(displayStatus) as any} 
                                      className={`w-fit shadow-sm ${
                                        isActive 
                                          ? 'ring-2 ring-primary/20' 
                                          : ''
                                      }`}
                                    >
                                      <span className="inline-flex items-center gap-1.5">
                                        {isActive && (
                                          <span className="h-2 w-2 rounded-full bg-current animate-pulse shadow-sm" />
                                        )}
                                        <span className="font-medium text-xs">{getStatusLabel(displayStatus)}</span>
                                      </span>
                                    </Badge>
                                    <div className="relative">
                                      <Progress 
                                        value={displayProgress} 
                                        className={`h-2 rounded-full ${
                                          isActive
                                            ? 'bg-primary/10'
                                            : 'bg-muted'
                                        }`}
                                      />
                                      {isActive && displayProgress > 0 && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 rounded-full animate-pulse" />
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </TableCell>

                      {/* Results Column */}
                      <TableCell className="align-top p-2">
                        {(() => {
                          const liveStatus = getLiveStatusForRow(row.id)
                          const isActive = isActiveStatus(liveStatus) || isGeneratingImages
                          
                          // Show loading skeleton during active generation
                          if (isActive && generatedImages.length === 0) {
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Spinner size="sm" />
                                  <span>Generating images...</span>
                                </div>
                              </div>
                            )
                          }
                          
                          // Show loading state if generating but have some images
                          if (isActive && generatedImages.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                {generatedImages.slice(0, isExpanded ? 10 : 4).map((img: any, index: number) => {
                                  const isFavorited = favoritesState[img.id] ?? (img.is_favorited === true)
                                  const displayUrl = thumbnailUrls[img.id] || loaderThumbnailUrls[img.id] || ''
                                  
                                  return (
                                    <div 
                                      key={img.id} 
                                      className="relative group w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        const actualIndex = generatedImages.findIndex(gImg => gImg.id === img.id)
                                        if (actualIndex !== -1) {
                                          setDialogState({ isOpen: true, rowId: row.id, imageIndex: actualIndex })
                                          await loadFullImage(img.id)
                                        }
                                      }}
                                    >
                                      {displayUrl ? (
                                        <Image
                                          src={displayUrl}
                                          alt="Generated"
                                          fill
                                          sizes="64px"
                                          className="object-cover"
                                          onError={() => loadThumbnail(img.id, img.thumbnail_path || img.output_path)}
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                        </div>
                                      )}
                                      
                                      <button
                                        key={`star-${img.id}-${isFavorited}`}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleToggleFavorite(img.id, isFavorited)
                                        }}
                                        className={`absolute top-1 left-1 p-1 rounded-full transition-all duration-200 z-20 backdrop-blur-sm ${
                                          isFavorited
                                            ? 'bg-yellow-400/20 hover:bg-yellow-400/30'
                                            : 'bg-black/40 hover:bg-black/60 opacity-90 group-hover:opacity-100'
                                        }`}
                                        title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                                      >
                                        {isFavorited ? (
                                          <Star className="w-3.5 h-3.5 text-yellow-400 drop-shadow-sm" style={{ fill: 'currentColor' }} />
                                        ) : (
                                          <Star className="w-3.5 h-3.5 text-white drop-shadow-sm hover:text-yellow-300 transition-colors" />
                                        )}
                                      </button>
                                    </div>
                                  )
                                })}
                                {/* Loading indicator for new images */}
                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm flex items-center justify-center">
                                  <Spinner size="sm" />
                                </div>
                              </div>
                            )
                          }
                          
                          if (generatedImages.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-4 text-center">
                                <div className="rounded-full bg-muted/50 p-2 mb-2">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                                </div>
                                <p className="text-xs font-medium text-muted-foreground">No results yet</p>
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Generate to see results</p>
                              </div>
                            )
                          }

                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {generatedImages.slice(0, isExpanded ? 10 : 4).map((img: any, index: number) => {
                                const isFavorited = favoritesState[img.id] ?? (img.is_favorited === true)
                                const displayUrl = thumbnailUrls[img.id] || loaderThumbnailUrls[img.id] || ''
                                
                                return (
                                  <div 
                                    key={img.id} 
                                    className="relative group w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in"
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      // Find the actual index in the generatedImages array
                                      const actualIndex = generatedImages.findIndex(gImg => gImg.id === img.id)
                                      if (actualIndex !== -1) {
                                        setDialogState({ isOpen: true, rowId: row.id, imageIndex: actualIndex })
                                        // Load full resolution when opening dialog
                                        await loadFullImage(img.id)
                                      }
                                    }}
                                  >
                                    {displayUrl ? (
                                      <Image
                                        src={displayUrl}
                                        alt="Generated"
                                        fill
                                        sizes="64px"
                                        className="object-cover"
                                        onError={() => loadThumbnail(img.id, img.thumbnail_path || img.output_path)}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                      </div>
                                    )}
                                    
                                    {/* Favorite button overlay - always visible in top-left */}
                                    <button
                                      key={`star-${img.id}-${isFavorited}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleToggleFavorite(img.id, isFavorited)
                                      }}
                                      className={`absolute top-1 left-1 p-1 rounded-full transition-all duration-200 z-20 backdrop-blur-sm ${
                                        isFavorited
                                          ? 'bg-yellow-400/20 hover:bg-yellow-400/30'
                                          : 'bg-black/40 hover:bg-black/60 opacity-90 group-hover:opacity-100'
                                      }`}
                                      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                      {isFavorited ? (
                                        <Star className="w-3.5 h-3.5 text-yellow-400 drop-shadow-sm" style={{ fill: 'currentColor' }} />
                                      ) : (
                                        <Star className="w-3.5 h-3.5 text-white drop-shadow-sm hover:text-yellow-300 transition-colors" />
                                      )}
                                    </button>
                                  </div>
                                )
                              })}
                              {generatedImages.length > (isExpanded ? 10 : 4) && (
                                <div className="flex items-center justify-center w-16 h-16 rounded bg-muted/50 border border-border/50 text-[10px] text-muted-foreground">
                                  +{generatedImages.length - (isExpanded ? 10 : 4)}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </TableCell>

                      {/* Actions Column */}
                      <TableCell className="align-top p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRow(row.id)}
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Single dynamic Dialog for image navigation */}
      <Dialog 
        open={dialogState.isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setDialogState({ isOpen: false, rowId: null, imageIndex: 0 })
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          {dialogState.rowId && (() => {
            const currentRow = rows.find(row => row.id === dialogState.rowId)
            if (!currentRow) return null
            
            const allImages = currentRow.variant_row_images || []
            // Defensive filtering: only images with is_generated === true
            const generatedImages = allImages.filter(img => {
              // Strict check: only include images explicitly marked as generated
              // Exclude null, undefined, false, and any other falsy values
              return img.is_generated === true
            })
            
            if (generatedImages.length === 0) return null
            
            const currentImage = generatedImages[dialogState.imageIndex]
            if (!currentImage) return null
            
            const isFavorited = getCurrentFavoriteStatus(currentImage.id, currentImage.is_favorited)
            const fullImageUrl = fullUrls[currentImage.id] || thumbnailUrls[currentImage.id] || loaderThumbnailUrls[currentImage.id] || ''
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Generated Image {dialogState.imageIndex + 1} of {generatedImages.length}
                  </DialogTitle>
                </DialogHeader>
                
                {/* Favorites button - top-left overlay */}
                <button 
                  onClick={() => handleToggleFavorite(currentImage.id, isFavorited)}
                  className="absolute top-4 left-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star 
                    className={`w-5 h-5 ${isFavorited ? 'fill-yellow-400 text-yellow-400' : 'text-white hover:text-yellow-300'}`} 
                  />
                </button>
                
                {/* Image container with navigation arrows */}
                <div className="relative w-full min-h-[400px]">
                  {/* Left arrow */}
                  {dialogState.imageIndex > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleNavigateImage('prev')}
                      className="absolute left-4 top-1/2 -translate-y-1/2 z-40 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white hover:text-white"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                  
                  {/* Image - centered using flexbox */}
                  <div className="flex items-center justify-center h-full min-h-[400px]">
                    {fullImageUrl ? (
                      <Image
                        src={fullImageUrl}
                        alt="Generated image"
                        width={1920}
                        height={1920}
                        className="max-w-full max-h-[80vh] object-contain rounded-lg"
                        loading="lazy"
                        onError={async () => {
                          const path = currentImage.output_path || currentImage.thumbnail_path
                          if (!path) return
                          try {
                            const response = await getSignedUrl(path)
                            if (response?.url) {
                              setThumbnailUrls(prev => ({ ...prev, [currentImage.id]: response.url }))
                            }
                          } catch {}
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-[80vh]">
                        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Right arrow */}
                  {dialogState.imageIndex < generatedImages.length - 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleNavigateImage('next')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 z-40 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white hover:text-white"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

