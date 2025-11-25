'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
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
import { Wand2, Sparkles, Copy, Trash2, Plus, X, AlertCircle, Play, Eye, EyeOff, ChevronDown, ChevronUp, Star, ChevronLeft, ChevronRight, ImageIcon, Folder, Upload, Archive } from 'lucide-react'
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
import { uploadImage, validateFile } from '@/lib/client-upload'

interface VariantsRowsWorkspaceProps {
  initialRows: VariantRow[]
  modelId?: string
  onRowsChange?: (rows: VariantRow[]) => void
}

const INTERNAL_IMAGE_MIME = 'application/x-ai-studio-image'

// Preset enhancement chips for quick access - organized by category
const PRESET_ENHANCEMENTS = {
  quality: [
    { label: '✨ Professional studio', value: 'Apply professional studio quality with polished lighting' },
    { label: '📸 Casual snapshot', value: 'Make casual snapshot with natural imperfections and amateur lighting' },
    { label: '🎥 Film grain', value: 'Add film grain texture with reduced sharpness' },
    { label: '📱 iPhone selfie', value: 'Apply iPhone front camera selfie with wide-angle distortion and arm\'s length perspective' }
  ],
  lighting: [
    { label: '🔥 Dramatic lighting', value: 'Apply dramatic lighting with high contrast and bold shadows' },
    { label: '🌅 Golden hour', value: 'Add golden hour lighting with warm color temperature and amber tones' },
    { label: '💡 Harsh overhead', value: 'Change to harsh overhead lighting with unflattering shadows' },
    { label: '🌙 Low-key lighting', value: 'Apply low-key lighting with underexposed shadows and high ISO noise' },
    { label: '🎭 Rembrandt lighting', value: 'Apply Rembrandt lighting with triangle of light under eye' },
    { label: '🪟 Natural window light', value: 'Change to natural window lighting with soft directional illumination' }
  ],
  degradation: [
    { label: '🎨 Lo-fi aesthetic', value: 'Add lo-fi aesthetic with chromatic aberration and lens distortion' },
    { label: '💨 Motion blur artifacts', value: 'Apply motion blur with camera shake and streaking' },
    { label: '✨ Lens flare', value: 'Add lens flare artifacts with washed-out highlights' },
    { label: '🎞️ Film grain texture', value: 'Add film grain with color shifts and reduced dynamic range' }
  ],
  composition: [
    { label: '📷 Casual snap', value: 'Apply candid composition with off-center framing and partial face crop' },
    { label: '🎯 Off-center framing', value: 'Create off-center framing with informal composition' }
  ],
  motion: [
    { label: '💨 Motion blur', value: 'Add motion blur with subtle streaking effect' },
    { label: '🎯 Tack sharp', value: 'Apply sharp focus with crystal clear details' },
    { label: '🌫️ Soft focus', value: 'Apply soft focus with gentle blur and reduced sharpness' }
  ],
  gaze: [
    { label: '👈 Look left', value: 'Have subject looking left, gaze away from camera' },
    { label: '👉 Look right', value: 'Have subject looking right, gaze away from camera' },
    { label: '👁️ Camera gaze', value: 'Subject looking directly at camera with engaged eye contact' },
    { label: '👇 Look down', value: 'Subject looking downward with contemplative gaze' }
  ],
  expression: [
    { label: '😊 Subtle smile', value: 'Add subtle smile with natural warmth' },
    { label: '😢 Melancholic', value: 'Apply melancholic expression with downcast gaze' },
    { label: '😗 Playful pout', value: 'Add playful pout with pursed lips' },
    { label: '😐 Neutral', value: 'Maintain neutral expression with relaxed features' },
    { label: '😮 Subtle surprise', value: 'Show subtle surprise with raised eyebrows' },
    { label: '💪 Confident pose', value: 'Apply confident body language with strong posture' },
    { label: '🤔 Pensive look', value: 'Add pensive expression with contemplative gaze' },
    { label: '😌 Gentle smile', value: 'Apply gentle smile with natural warmth' },
    { label: '😊 Relaxed gaze', value: 'Maintain relaxed gaze with natural expression' }
  ],
  color: [
    { label: '🎨 Muted palette', value: 'Apply muted earth tone palette with desaturated colors' },
    { label: '🌈 Vibrant colors', value: 'Increase color vibrancy and saturation' },
    { label: '⚫ Monochrome', value: 'Convert to black and white with strong tonal contrast' }
  ],
  depth: [
    { label: '📷 Shallow DOF', value: 'Add shallow depth of field with bokeh background blur' },
    { label: '🌄 Deep focus', value: 'Apply deep depth of field with sharp focus throughout' }
  ]
}

export function VariantsRowsWorkspace({ initialRows, modelId, onRowsChange }: VariantsRowsWorkspaceProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [generatingPromptRowId, setGeneratingPromptRowId] = useState<string | null>(null)
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
    imageType: 'generated' | 'reference'; // Track which type of images we're viewing
  }>({ isOpen: false, rowId: null, imageIndex: 0, imageType: 'generated' })
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})
  const loadingImagesRef = useRef<Set<string>>(new Set())
  const refreshTimeout = useRef<number | null>(null)
  const prevRowsRef = useRef<VariantRow[]>(initialRows)
  const isInitialMount = useRef(true)
  const deletedRowIdsRef = useRef<Set<string>>(new Set())
  const lastRefreshTimeRef = useRef<number>(0)
  const isRefreshingRef = useRef<boolean>(false)
  // Store jobId -> rowId mapping to avoid closure issues in polling callback
  const jobIdToRowIdRef = useRef<Record<string, string>>({})
  // Bulk upload state
  const [isFolderDropActive, setIsFolderDropActive] = useState(false)
  const [bulkUploadState, setBulkUploadState] = useState<Array<{
    rowId: string
    filename: string
    status: 'pending' | 'uploading' | 'success' | 'error'
    progress: number
    error?: string
  }>>([])
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [dragOverRefRowId, setDragOverRefRowId] = useState<string | null>(null)
  const zipFileInputRef = useRef<HTMLInputElement>(null)
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false)
  
  // Sync initialRows prop changes to local state (aligns with rows tab pattern)
  // This ensures data stays fresh when parent re-renders with new data
  // BUT: Don't overwrite local deletions - if we've deleted a row locally, don't bring it back
  useEffect(() => {
    // Skip if this is the initial mount (handled separately)
    if (isInitialMount.current) {
      return
    }
    
    // Only update if initialRows actually changed (by comparing IDs)
    const currentIds = new Set(rows.map(r => r.id))
    const newIds = new Set(initialRows.map(r => r.id))
    
    // Check if there are new rows in initialRows that aren't in current state
    const newRowIds = Array.from(newIds).filter(id => !currentIds.has(id))
    
    // Check if there are rows in current state that aren't in initialRows
    // BUT exclude rows we've explicitly deleted (they should stay deleted)
    const removedRowIds = Array.from(currentIds).filter(id => {
      if (!newIds.has(id)) {
        // This row is in current state but not in initialRows
        // Only treat as "removed" if we didn't explicitly delete it
        return !deletedRowIdsRef.current.has(id)
      }
      return false
    })
    
    // Only sync if there are genuinely new rows to add, or if initialRows has fewer rows
    // AND we haven't explicitly deleted those rows
    const hasNewRows = newRowIds.length > 0
    const hasRemovedRows = removedRowIds.length > 0 && removedRowIds.some(id => !deletedRowIdsRef.current.has(id))
    
    // If initialRows has new rows that we don't have, merge them in
    if (hasNewRows) {
      console.log('[Variants] Syncing new rows from initialRows', {
        newRowIds,
        currentCount: rows.length,
        newCount: initialRows.length
      })
      
      // Merge: keep existing rows, add new ones from initialRows
      const existingRowMap = new Map(rows.map(r => [r.id, r]))
      const newRowsFromInitial = initialRows.filter(r => !existingRowMap.has(r.id) && !deletedRowIdsRef.current.has(r.id))
      
      if (newRowsFromInitial.length > 0) {
        setRows(prev => [...prev, ...newRowsFromInitial])
      }
    }
    
    // If initialRows is missing rows that we have (and we didn't delete them), 
    // it means they were deleted elsewhere - remove them
    if (hasRemovedRows) {
      const rowsToRemove = removedRowIds.filter(id => !deletedRowIdsRef.current.has(id))
      console.log('[Variants] Removing rows that are missing from initialRows', {
        removedRowIds: rowsToRemove
      })
      setRows(prev => prev.filter(r => newIds.has(r.id) || deletedRowIdsRef.current.has(r.id)))
    }
    
    // Clean up deletedRowIdsRef: if a row is no longer in initialRows and we deleted it,
    // we can remove it from the deleted set (it's been confirmed deleted)
    const confirmedDeletedIds = Array.from(deletedRowIdsRef.current).filter(id => !newIds.has(id))
    if (confirmedDeletedIds.length > 0) {
      confirmedDeletedIds.forEach(id => deletedRowIdsRef.current.delete(id))
    }
  }, [initialRows, rows])
  
  // Notify parent of rows changes via useEffect (not during render)
  useEffect(() => {
    // Skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      prevRowsRef.current = rows
      return
    }
    
    // Check if rows actually changed
    const rowsChanged = 
      prevRowsRef.current.length !== rows.length ||
      prevRowsRef.current.some((prevRow, idx) => prevRow.id !== rows[idx]?.id)
    
    if (rowsChanged) {
      prevRowsRef.current = rows
      if (onRowsChange) {
        // Use setTimeout to ensure this runs after render completes
        setTimeout(() => {
          onRowsChange(rows)
        }, 0)
      }
    }
  }, [rows, onRowsChange])
  
  // Refresh row data after generation (aligns with rows tab pattern)
  const refreshRowData = useCallback(async () => {
  // FIXED: Added throttling to prevent rapid successive refreshes
    const now = Date.now()
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current
    
    // Prevent rapid successive refreshes (throttle to at most once per 2 seconds)
    if (timeSinceLastRefresh < 2000 || isRefreshingRef.current) {
      return
    }
    
    isRefreshingRef.current = true
    lastRefreshTimeRef.current = now
    
    try {
      const url = new URL('/api/variants/rows', window.location.origin)
      // Add cache-busting timestamp
      url.searchParams.set('_t', Date.now().toString())
      // Add model_id filter if provided
      if (modelId) {
        url.searchParams.set('model_id', modelId)
      }
      
      const response = await fetch(url.toString(), { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      if (response.ok) {
        const { rows: refreshedRows } = await response.json()
        // Filter by modelId if provided (defensive check)
        const filteredRows = modelId 
          ? (refreshedRows || []).filter((row: VariantRow) => row.model_id === modelId)
          : (refreshedRows || [])
        
        // Merge strategy: preserve existing rows, update with fresh data, add new ones
        // This aligns with rows tab pattern for better data consistency
        setRows(prev => {
          const refreshedMap = new Map(filteredRows.map((r: VariantRow) => [r.id, r]))
          
          // Update existing rows with fresh data
          const mergedRows = prev.map(prevRow => {
            const refreshedRow = refreshedMap.get(prevRow.id)
            return refreshedRow || prevRow
          })
          
          // Add any new rows that weren't in prev
          const newRows = filteredRows.filter((r: VariantRow) => !prev.some(pr => pr.id === r.id))
          
          return [...mergedRows, ...newRows]
        })
        // onRowsChange will be called via useEffect when rows state updates
      }
    } catch (error) {
      console.error('Failed to refresh row data:', error)
    } finally {
      isRefreshingRef.current = false
    }
  }, [modelId])

  // Refresh a single row and update local state
  const refreshSingleRow = useCallback(async (rowId: string) => {
    try {
      // Add cache-busting timestamp
      const url = new URL(`/api/variants/rows/${rowId}`, window.location.origin)
      url.searchParams.set('_t', Date.now().toString())
      
      const res = await fetch(url.toString(), { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      if (!res.ok) return
      const { row } = await res.json()
      
      // Normalize images: ensure is_generated is explicitly boolean
      const normalizedRow = {
        ...row,
        variant_row_images: (row.variant_row_images || []).map((img: any) => ({
          ...img,
          // Explicitly set is_generated to boolean (true for generated, false for reference)
          is_generated: img.is_generated === true
        }))
      }
      
      // Update the specific row in state using functional setState to ensure proper merge
      setRows(prev => {
        const updated = prev.map(r => {
          if (r.id === rowId) {
            // Merge: preserve any local state but update with fresh data
            return normalizedRow
          }
          return r
        })
        // onRowsChange will be called via useEffect when rows state updates
        return updated
      })
    } catch (e) {
      console.error('Failed to refresh single row:', e)
    }
  }, [onRowsChange])

  // Debounce refresh to avoid redundant fetches when many jobs complete together
  // FIXED: Increased debounce time and added check to prevent unnecessary calls
  const scheduleRefresh = useCallback(() => {
    refreshTimeout.current = window.setTimeout(() => {
      refreshRowData()
      refreshTimeout.current = null
    }, 1500)
    if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
    // Increased debounce to 1.5 seconds to reduce rapid successive calls
  }, [refreshRowData])

  const { startPolling, pollingState } = useJobPolling((jobId, status) => {
    if (['succeeded', 'failed'].includes(status)) {
      // Use ref instead of pollingState to avoid closure issues
      // The ref always has the latest jobId -> rowId mapping
      const variantRowId = jobIdToRowIdRef.current[jobId] || (pollingState as any)[jobId]?.rowId as string | undefined
      if (status === 'succeeded' && variantRowId) {
        // Immediately refresh the specific row when job succeeds
        refreshSingleRow(variantRowId).catch(() => {})
        // Clear generating state when job completes
        setGeneratingImageRowId(null)
      } else if (status === 'failed' && variantRowId) {
        // Clear generating state on failure too
        setGeneratingImageRowId(null)
      }
      // Clean up the mapping when job completes
      if (variantRowId) {
        delete jobIdToRowIdRef.current[jobId]
      }
      toast({
        title: status === 'succeeded' ? 'Generation Complete' : 'Generation Failed',
        description: `Job ${jobId.slice(0, 8)}... has ${status}`,
        variant: status === 'failed' ? 'destructive' : 'default'
      })
      // Schedule a debounced full refresh as backup
      scheduleRefresh()
    }
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
        row_id: row.id, // Use variant row id
        model_id: '', // Not applicable for variant rows
        team_id: row.team_id,
        user_id: row.user_id,
        output_url: img.output_path,
        thumbnail_url: img.thumbnail_path || undefined,
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

  // Handle generate prompt for a row
  const handleGeneratePrompt = useCallback(async (rowId: string) => {
    setGeneratingPromptRowId(rowId)
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/prompt/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate prompt')
      }

      const data = await response.json()
      const generatedPrompt = data.prompt

      // Update the row's prompt in local state
      setRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return { ...row, prompt: generatedPrompt }
        }
        return row
      }))

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
      setGeneratingPromptRowId(null)
    }
  }, [toast])

  // Handle copy prompt to clipboard
  const handleCopyPrompt = useCallback((prompt: string) => {
    if (!prompt) return
    navigator.clipboard.writeText(prompt)
    toast({
      title: 'Copied',
      description: 'Prompt copied to clipboard'
    })
  }, [toast])

  // Handle prompt change for a row
  const handlePromptChange = useCallback((rowId: string, value: string) => {
    setRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, prompt: value }
      }
      return row
    }))
  }, [])

  // Handle delete row
  const handleDeleteRow = useCallback(async (rowId: string) => {
    try {
      const response = await fetch(`/api/variants/rows/${rowId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete row')
      }

      // Mark as deleted to prevent sync from bringing it back
      deletedRowIdsRef.current.add(rowId)

      // Remove from local state and clean up related state
      setRows(prev => {
        const filtered = prev.filter(r => r.id !== rowId)
        if (filtered.length !== prev.length) {
          // Row was actually removed, clean up related state
          setExpandedRows(prevExpanded => {
            const next = new Set(prevExpanded)
            next.delete(rowId)
            return next
          })
          setOriginalPrompts(prevPrompts => {
            const next = { ...prevPrompts }
            delete next[rowId]
            return next
          })
          setEnhanceInstructions(prevInstructions => {
            const next = { ...prevInstructions }
            delete next[rowId]
            return next
          })
          setSelectedPresets(prevPresets => {
            const next = { ...prevPresets }
            delete next[rowId]
            return next
          })
          setShowCompareView(prevCompare => {
            const next = { ...prevCompare }
            delete next[rowId]
            return next
          })
        }
        return filtered
      })

      toast({
        title: 'Row deleted',
        description: 'Variant row deleted successfully'
      })
    } catch (error) {
      console.error('Delete row error:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete row',
        variant: 'destructive'
      })
    }
  }, [toast])

  // Handle delete image from row
  const handleDeleteImage = useCallback(async (rowId: string, imageId: string) => {
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/images/${imageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete image')
      }

      // Update local state to remove the image
      setRows(prev => prev.map(row => {
        if (row.id === rowId) {
          const updatedImages = (row.variant_row_images || []).filter(img => img.id !== imageId)
          return { ...row, variant_row_images: updatedImages }
        }
        return row
      }))

      toast({
        title: 'Image deleted',
        description: 'Image removed from variant row'
      })
    } catch (error) {
      console.error('Delete image error:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete image',
        variant: 'destructive'
      })
    }
  }, [toast])

  // Handle generate images for a row
  const handleGenerateImages = useCallback(async (rowId: string) => {
    setGeneratingImageRowId(rowId)
    try {
      const response = await fetch(`/api/variants/rows/${rowId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate images')
      }

      const data = await response.json()
      
      toast({
        title: 'Generation started',
        description: 'Images are being generated. This may take a moment.'
      })

      // Refresh the row to get updated images after generation
      await refreshSingleRow(rowId)
    } catch (error) {
      console.error('Generate images error:', error)
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Could not generate images',
        variant: 'destructive'
      })
    } finally {
      setGeneratingImageRowId(null)
    }
  }, [toast, refreshSingleRow])

  // Handle reference image drag over
  const handleRefDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRefRowId(rowId)
  }, [])

  // Handle reference image drag leave
  const handleRefDragLeave = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverRefRowId(null)
    }
  }, [])

  // Handle reference image drop
  const handleRefDrop = useCallback(async (e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRefRowId(null)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/'))

    if (imageFiles.length === 0) {
      toast({
        title: 'No images',
        description: 'Please drop image files',
        variant: 'destructive'
      })
      return
    }

    // Use the existing addRefsFromFiles logic
    await addRefsFromFiles(imageFiles, rowId)
  }, [toast])

  // Toggle row expansion
  const toggleRowExpansion = useCallback((rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
        // Store original prompt when expanding for comparison
        const row = rows.find(r => r.id === rowId)
        if (row?.prompt && !originalPrompts[rowId]) {
          setOriginalPrompts(prevPrompts => ({
            ...prevPrompts,
            [rowId]: row.prompt!
          }))
        }
      }
      return next
    })
  }, [rows, originalPrompts])

  // Toggle compare view
  const toggleCompareView = useCallback((rowId: string) => {
    setShowCompareView(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }))
  }, [])

  // Handle preset chip selection
  const handlePresetChip = useCallback((rowId: string, value: string, label: string) => {
    setSelectedPresets(prev => {
      const current = prev[rowId] || []
      const isSelected = current.includes(label)
      const updated = isSelected
        ? current.filter(l => l !== label)
        : [...current, label]
      
      // Update instructions based on selected presets
      setEnhanceInstructions(prevInstructions => {
        const currentInstructions = prevInstructions[rowId] || ''
        const currentValues = currentInstructions ? currentInstructions.split('. ').filter(s => s.trim()) : []
        
        if (isSelected) {
          // Remove this value
          const filtered = currentValues.filter(v => !v.includes(value))
          return {
            ...prevInstructions,
            [rowId]: filtered.join('. ')
          }
        } else {
          // Add this value
          const combined = [...currentValues, value].join('. ')
          return {
            ...prevInstructions,
            [rowId]: combined
          }
        }
      })
      
      return {
        ...prev,
        [rowId]: updated
      }
    })
  }, [])

  // Clear presets for a row
  const clearPresets = useCallback((rowId: string) => {
    setSelectedPresets(prev => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
    setEnhanceInstructions(prev => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
  }, [])

  // Handle enhance prompt
  const handleEnhancePrompt = useCallback(async (rowId: string) => {
    const row = rows.find(r => r.id === rowId)
    if (!row?.prompt) {
      toast({
        title: 'No prompt',
        description: 'Generate a prompt first before enhancing',
        variant: 'destructive'
      })
      return
    }

    const instructions = enhanceInstructions[rowId]?.trim()
    if (!instructions) {
      toast({
        title: 'No instructions',
        description: 'Please provide enhancement instructions',
        variant: 'destructive'
      })
      return
    }

    setEnhancingRowId(rowId)
    try {
      // Store original prompt if not already stored
      if (!originalPrompts[rowId]) {
        setOriginalPrompts(prev => ({
          ...prev,
          [rowId]: row.prompt!
        }))
      }

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

      const data = await response.json()
      const enhancedPrompt = data.prompt

      // Update the row's prompt in local state
      setRows(prev => prev.map(r => {
        if (r.id === rowId) {
          return { ...r, prompt: enhancedPrompt }
        }
        return r
      }))

      toast({
        title: 'Prompt enhanced',
        description: 'Variant prompt enhanced successfully'
      })
    } catch (error) {
      console.error('Enhance prompt error:', error)
      toast({
        title: 'Enhancement failed',
        description: error instanceof Error ? error.message : 'Could not enhance prompt',
        variant: 'destructive'
      })
    } finally {
      setEnhancingRowId(null)
    }
  }, [rows, enhanceInstructions, originalPrompts, toast])


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

  // Navigation handlers for image dialog
  const handleNavigateImage = useCallback(async (direction: 'prev' | 'next') => {
    setDialogState(prev => {
      if (!prev.rowId) return prev
      
      const currentRow = rows.find(row => row.id === prev.rowId)
      if (!currentRow) return prev
      
      const allImages = currentRow.variant_row_images || []
      
      // Get the appropriate image array based on imageType
      let images: any[] = []
      if (prev.imageType === 'generated') {
        // Defensive filtering: only images with is_generated === true
        images = allImages.filter(img => {
          // Strict check: only include images explicitly marked as generated
          // Exclude null, undefined, false, and any other falsy values
          return img.is_generated === true
        })
      } else {
        // Reference images: is_generated !== true
        images = allImages.filter(img => {
          return img.is_generated !== true
        })
      }
      
      const newIndex = direction === 'prev' 
        ? Math.max(0, prev.imageIndex - 1)
        : Math.min(images.length - 1, prev.imageIndex + 1)
      
      // Load full resolution for new image
      const newImage = images[newIndex]
      if (newImage) {
        if (prev.imageType === 'generated') {
          loadFullImage(newImage.id).catch(() => {})
        } else {
          loadThumbnail(newImage.id, newImage.output_path).catch(() => {})
        }
      }
      
      return { ...prev, imageIndex: newIndex }
    })
  }, [rows, loadFullImage, loadThumbnail])

  // Handle keyboard navigation in dialog
  useEffect(() => {
    if (!dialogState.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleNavigateImage('prev')
      } else if (e.key === 'ArrowRight') {
        handleNavigateImage('next')
      } else if (e.key === 'Escape') {
        setDialogState({ isOpen: false, rowId: null, imageIndex: 0, imageType: 'generated' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogState.isOpen, handleNavigateImage])

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
  // Also refresh data on mount to ensure we have the latest (aligns with rows tab pattern)
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
    
    // FIXED: Removed refresh on mount - initialRows from server component is already fresh
    // Realtime subscriptions will handle any updates that occur after mount
    // This prevents unnecessary GET /variants requests on every mount
    
    // Listen for custom events when variants are added from other tabs
    const handleVariantsAdded = (event: CustomEvent) => {
      const { modelId: eventModelId, rowsCreated } = event.detail || {}
      
      // If this tab is filtered by modelId, only refresh if the event is for that model
      if (modelId) {
        if (eventModelId !== modelId) {
          return // Not for this model, ignore
        }
      }
      // If no modelId filter, refresh for all events (global variants tab)
      
      console.log('[Variants] Custom event: variants added', {
        eventModelId,
        currentModelId: modelId,
        rowsCreated,
        willRefresh: true
      })
      
      // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
      scheduleRefresh()
      // Refresh server-side cache to ensure parent Server Component refetches data
    }
    
    window.addEventListener('variants:rows-added', handleVariantsAdded as EventListener)
    
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
          // Refresh the specific row when job completes
          const variantRowId = String(next.variant_row_id)
          if (variantRowId) {
            refreshSingleRow(variantRowId).catch(() => {})
            scheduleRefresh()
          }
        }
      })
      .subscribe()
      ;(window as any).__variantJobsRealtime = jobsChannel
      
      // Realtime subscription to variant_rows changes (INSERT, UPDATE, DELETE)
      // This ensures UI updates when variant rows are created, updated, or deleted
      // Aligns with rows tab pattern which listens to all job events
      const variantRowsChannel = supabase.channel(`variant-rows-${modelId || 'all'}`)
      
      // Listen for INSERT events
      variantRowsChannel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'variant_rows'
      }, (payload: any) => {
        const newRow = payload?.new
        if (!newRow) return
        
        // Filter by model_id if modelId is provided (model-specific tab)
        if (modelId) {
          if (newRow.model_id !== modelId) {
            return // Not for this model, ignore
          }
        }
        
        console.log('[Variants] New variant row inserted via realtime', {
          rowId: newRow.id,
          modelId: newRow.model_id,
          currentModelId: modelId,
          willRefresh: true
        })
        
        // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
        scheduleRefresh()
      })
      // Listen for UPDATE events (e.g., name changes, prompt updates)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'variant_rows'
      }, (payload: any) => {
        const updatedRow = payload?.new
        if (!updatedRow) return
        
        // Filter by model_id if modelId is provided
        if (modelId) {
          if (updatedRow.model_id !== modelId) {
            return
          }
        }
        
        console.log('[Variants] Variant row updated via realtime', {
          rowId: updatedRow.id,
          modelId: updatedRow.model_id
        })
        
        // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
        if (updatedRow.id) {
          refreshSingleRow(updatedRow.id).catch(() => {})
        } else {
          scheduleRefresh()
        }
      })
      // Listen for DELETE events
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'variant_rows'
      }, (payload: any) => {
        const deletedRow = payload?.old
        if (!deletedRow) return
        
        // Filter by model_id if modelId is provided
        if (modelId) {
          if (deletedRow.model_id !== modelId) {
            return
          }
        }
        
        console.log('[Variants] Variant row deleted via realtime', {
          rowId: deletedRow.id,
          modelId: deletedRow.model_id
        })
        
        // Mark as deleted to prevent sync from bringing it back
        deletedRowIdsRef.current.add(deletedRow.id)
        
        // Remove from local state immediately and clean up related state
        setRows(prev => {
          const filtered = prev.filter(r => r.id !== deletedRow.id)
          // Clean up related state when row is deleted
          if (filtered.length !== prev.length) {
            // Row was actually removed, clean up related state
            setExpandedRows(prevExpanded => {
              const next = new Set(prevExpanded)
              next.delete(deletedRow.id)
              return next
            })
            setOriginalPrompts(prevPrompts => {
              const next = { ...prevPrompts }
              delete next[deletedRow.id]
              return next
            })
            setEnhanceInstructions(prevInstructions => {
              const next = { ...prevInstructions }
              delete next[deletedRow.id]
              return next
            })
            setSelectedPresets(prevPresets => {
              const next = { ...prevPresets }
              delete next[deletedRow.id]
              return next
            })
            setShowCompareView(prevCompare => {
              const next = { ...prevCompare }
              delete next[deletedRow.id]
              return next
            })
          }
          return filtered
        })
      })
      .subscribe()
      ;(window as any).__variantRowsRealtime = variantRowsChannel

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
        
        // Refresh the specific row to show new image
        // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
        const variantRowId = String(newImage.variant_row_id)
        // Only refresh if the row exists in our current state (avoids unnecessary API calls for other models)
        const rowExists = rows.some(r => r.id === variantRowId)
        if (!rowExists && modelId) {
          // Row doesn't exist in current state and we're filtering by modelId, skip refresh
          return
        }
        if (variantRowId) {
          // Debounce to batch multiple image inserts
          if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
          refreshTimeout.current = window.setTimeout(() => {
            refreshSingleRow(variantRowId).catch(() => {})
            refreshTimeout.current = null
          }, 500)
        }
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
        
        // Refresh the specific row to show updated image
        const variantRowId = String(updatedImage.variant_row_id)
        if (variantRowId) {
          setTimeout(() => {
            refreshSingleRow(variantRowId).catch(() => {})
          }, 200)
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'variant_row_images'
      }, (payload: any) => {
        const deletedImage = payload?.old
        if (!deletedImage || !deletedImage.variant_row_id) return
        
        console.log('[Variants] Image deleted via realtime', {
          imageId: deletedImage.id,
          variantRowId: deletedImage.variant_row_id
        })
        
        // Update state immediately to remove the deleted image
        setRows(prev => prev.map(row => {
          if (row.id === deletedImage.variant_row_id) {
            return {
              ...row,
              variant_row_images: row.variant_row_images?.filter(img => img.id !== deletedImage.id) || []
            }
          }
          return row
        }))
      })
      .subscribe()
      ;(window as any).__variantImagesRealtime = imagesChannel
      
      console.log('[Variants] Realtime subscriptions established', {
        jobsChannel: 'variant-jobs',
        rowsChannel: 'variant-rows-insert',
        imagesChannel: 'variant-row-images',
        modelId: modelId || 'all'
      })
    } catch (error) {
      console.error('[Variants] Failed to setup realtime:', error)
    }
    
    return () => {
      // Clear refresh timeout
      if (refreshTimeout.current) {
        window.clearTimeout(refreshTimeout.current)
        refreshTimeout.current = null
      }
      cancelled = true
      // Clear jobId mapping ref on unmount
      jobIdToRowIdRef.current = {}
      // Remove custom event listener
      window.removeEventListener('variants:rows-added', handleVariantsAdded as EventListener)
      
      try {
        if ((window as any).__variantJobsRealtime) {
          supabase.removeChannel((window as any).__variantJobsRealtime)
          ;(window as any).__variantJobsRealtime = null
        }
        if ((window as any).__variantRowsRealtime) {
          supabase.removeChannel((window as any).__variantRowsRealtime)
          ;(window as any).__variantRowsRealtime = null
        }
        if ((window as any).__variantImagesRealtime) {
          supabase.removeChannel((window as any).__variantImagesRealtime)
          ;(window as any).__variantImagesRealtime = null
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]) // Re-subscribe when modelId changes

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

  // Helper function to retry operations with exponential backoff
  const retryWithBackoff = async (
    operation: () => Promise<any>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<any> => {
    let lastError: Error
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt === maxRetries) {
          throw lastError
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw lastError!
  }

  // Helper function to refresh authentication token
  const refreshAuth = async () => {
    const { data: { session }, error } = await supabase.auth.refreshSession()
    if (error) {
      throw new Error('Failed to refresh authentication')
    }
    return session
  }

  // Extract all image files from dropped items (supports folders and zip files)
  const extractImageFiles = async (dataTransfer: DataTransfer): Promise<File[]> => {
    const imageFiles: File[] = []
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const zipTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-zip']
    
    // Helper function to extract images from a zip file
    const extractFromZip = async (zipFile: File): Promise<File[]> => {
      try {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(zipFile)
        const extractedFiles: File[] = []
        
        // Process all files in the zip
        const filePromises: Promise<void>[] = []
        zip.forEach((relativePath, file) => {
          // Skip directories
          if (file.dir) return
          
          // Check if file is an image by extension
          const extension = relativePath.split('.').pop()?.toLowerCase()
          const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension || '')
          
          if (isImage) {
            filePromises.push(
              file.async('blob').then(blob => {
                // Create a File object from the blob with the original filename
                const fileName = relativePath.split('/').pop() || `image-${Date.now()}.${extension}`
                const extractedFile = new File([blob], fileName, { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` })
                extractedFiles.push(extractedFile)
              })
            )
          }
        })
        
        await Promise.all(filePromises)
        return extractedFiles
      } catch (error) {
        console.error('Error extracting zip file:', error)
        throw new Error(`Failed to extract zip file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    const processItem = async (item: DataTransferItem): Promise<void> => {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (!file) return
        
        // Check if it's a zip file
        if (zipTypes.includes(file.type) || file.name.toLowerCase().endsWith('.zip')) {
          try {
            const zipImages = await extractFromZip(file)
            imageFiles.push(...zipImages)
            return
          } catch (error) {
            console.error('Error processing zip file:', error)
            throw error
          }
        }
        
        const entry = item.webkitGetAsEntry?.() || (item as any).getAsEntry?.()
        
        if (entry) {
          if (entry.isFile) {
            if (allowedTypes.includes(file.type)) {
              imageFiles.push(file)
            }
          } else if (entry.isDirectory) {
            // Process directory recursively
            const dirReader = (entry as any).createReader()
            const entries = await new Promise<any[]>((resolve) => {
              dirReader.readEntries(resolve)
            })
            
            for (const subEntry of entries) {
              if (subEntry.isFile) {
                const file = await new Promise<File>((resolve) => {
                  subEntry.file(resolve)
                })
                if (allowedTypes.includes(file.type)) {
                  imageFiles.push(file)
                }
              } else if (subEntry.isDirectory) {
                // Recursively process subdirectories
                const subDirReader = subEntry.createReader()
                const subEntries = await new Promise<any[]>((resolve) => {
                  subDirReader.readEntries(resolve)
                })
                
                for (const subSubEntry of subEntries) {
                  if (subSubEntry.isFile) {
                    const file = await new Promise<File>((resolve) => {
                      subSubEntry.file(resolve)
                    })
                    if (allowedTypes.includes(file.type)) {
                      imageFiles.push(file)
                    }
                  }
                }
              }
            }
          }
        } else {
          // Fallback: if we have a file but no entry, check if it's an image
          if (allowedTypes.includes(file.type)) {
            imageFiles.push(file)
          }
        }
      }
    }

    // Process all items
    for (let i = 0; i < dataTransfer.items.length; i++) {
      try {
        await processItem(dataTransfer.items[i])
      } catch (error) {
        // If zip extraction fails, log but continue with other files
        console.error('Error processing item:', error)
        // Re-throw zip errors so they can be handled by the caller
        if (error instanceof Error && error.message.includes('zip')) {
          throw error
        }
      }
    }

    // Sort alphabetically by filename
    return imageFiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  // Global drag handlers for the table
  const handleTableDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const hasValidFiles = Array.from(e.dataTransfer.items).some(item => 
      item.kind === 'file' && item.type.startsWith('image/')
    )
    const hasInternalImage = Array.from(e.dataTransfer.types || []).includes(INTERNAL_IMAGE_MIME)
    
    if (hasValidFiles || hasInternalImage) {
      setIsGlobalDragActive(true)
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  const handleTableDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Only clear global drag state if we're leaving the table entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsGlobalDragActive(false)
    }
  }

  // Handle folder drag and drop
  const handleFolderDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFolderDropActive(true)
  }

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only deactivate if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFolderDropActive(false)
    }
  }

  const handleFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFolderDropActive(false)
    setIsGlobalDragActive(false)
    
    if (isBulkUploading) {
      toast({
        title: 'Upload in progress',
        description: 'Please wait for the current upload to complete',
        variant: 'destructive'
      })
      return
    }

    try {
      const imageFiles = await extractImageFiles(e.dataTransfer)
      
      if (imageFiles.length === 0) {
        toast({
          title: 'No images found',
          description: 'No valid image files found in the dropped folder',
          variant: 'destructive'
        })
        return
      }

      await handleBulkImageUpload(imageFiles)
    } catch (error) {
      console.error('Error processing folder:', error)
      toast({
        title: 'Error processing folder',
        description: error instanceof Error ? error.message : 'Failed to process dropped folder',
        variant: 'destructive'
      })
    }
  }

  // Upload dropped files as references and add to variant row
  const addRefsFromFiles = async (files: File[], rowId: string) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const uploadPromises = imageFiles.map(file => {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10)
        return retryWithBackoff(async () => {
          await refreshAuth()
          return uploadImage(file, 'refs', user.id)
        }, 3, 1000)
      })

      const results = await Promise.all(uploadPromises)
      
      // Prepare images for API call
      const imagesToAdd = results
        .filter(r => r?.objectPath)
        .map(r => ({
          outputPath: r.objectPath,
          thumbnailPath: null,
          sourceRowId: null
        }))

      if (imagesToAdd.length === 0) {
        toast({
          title: 'No images uploaded',
          description: 'Failed to upload images',
          variant: 'destructive'
        })
        return
      }

      // Add images to variant row via API
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/variants/rows/${rowId}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ images: imagesToAdd })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to add images: ${response.status} ${errorText}`)
      }

      await refreshSingleRow(rowId)
      toast({ 
        title: `Added ${imagesToAdd.length} reference image${imagesToAdd.length === 1 ? '' : 's'}`,
        description: 'Images added to variant row'
      })
    } catch (err) {
      toast({ 
        title: 'Ref upload failed', 
        description: err instanceof Error ? err.message : 'Error', 
        variant: 'destructive' 
      })
    }
  }

  // Handle bulk image upload - creates rows and adds images
  const handleBulkImageUpload = async (imageFiles: File[]) => {
    setIsBulkUploading(true)
    setBulkUploadState([])

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      console.log('Bulk upload starting for variants, user:', user.id, 'files:', imageFiles.length)

      // Initialize bulk upload state for UI feedback
      const initialBulkState = imageFiles.map((file, index) => ({
        rowId: `temp-${index}`,
        filename: file.name,
        status: 'pending' as const,
        progress: 0
      }))
      setBulkUploadState(initialBulkState)

      // Convert files to base64 for server processing
      const filesData = await Promise.all(
        imageFiles.map(async (file) => {
          return new Promise<{ name: string; size: number; type: string; data: string }>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1] // Remove data:image/...;base64, prefix
              resolve({
                name: file.name,
                size: file.size,
                type: file.type,
                data: base64
              })
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        })
      )

      // Update UI to show processing
      setBulkUploadState(prev => prev.map(item => ({ ...item, status: 'uploading', progress: 50 })))

      // Call server-side bulk upload API
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/variants/upload/bulk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          model_id: modelId || null,
          files: filesData
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Server-side bulk upload failed: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log('Bulk upload result:', result)

      // Update UI with results and add rows immediately for real-time updates
      const updatedBulkState = imageFiles.map((file, index) => {
        const successResult = result.results.find((r: any) => r.filename === file.name)
        const errorResult = result.errors.find((e: any) => e.filename === file.name)
        
        if (successResult) {
          return {
            rowId: successResult.row.id,
            filename: file.name,
            status: 'success' as const,
            progress: 100
          }
        } else if (errorResult) {
          return {
            rowId: `temp-${index}`,
            filename: file.name,
            status: 'error' as const,
            progress: 0,
            error: errorResult.error
          }
        } else {
          return {
            rowId: `temp-${index}`,
            filename: file.name,
            status: 'error' as const,
            progress: 0,
            error: 'Unknown error'
          }
        }
      })
      setBulkUploadState(updatedBulkState)

      // Add successful rows to the UI immediately for real-time updates
      if (result.results.length > 0) {
        // Add rows to state immediately
        setRows(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newRows = result.results
            .map((r: any) => r.row)
            .filter((row: any) => !existingIds.has(row.id))
          return [...newRows, ...prev]
        })

        // Refresh each row to load images and thumbnails immediately
        for (const successResult of result.results) {
          const row = successResult.row
          // Refresh to get images loaded
          await refreshSingleRow(row.id).catch(() => {})
        }
      }

      // Show completion toast
      if (result.summary.successful > 0) {
        toast({
          title: 'Bulk upload completed',
          description: `Successfully uploaded ${result.summary.successful} image${result.summary.successful === 1 ? '' : 's'}${result.summary.failed > 0 ? `, ${result.summary.failed} failed` : ''}`,
          variant: result.summary.failed > 0 ? 'destructive' : 'default'
        })
      }

      // Clear bulk upload state after a delay
      setTimeout(() => {
        setBulkUploadState([])
      }, 5000)
    } catch (err) {
      console.error('Bulk upload error:', err)
      toast({
        title: 'Bulk upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsBulkUploading(false)
    }
  }

  // Add new variant row
  const handleAddRow = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/variants/rows', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          ...(modelId ? { model_id: modelId } : {})
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create variant row')
      }

      const { row } = await response.json()
      
      // Add row to state immediately for real-time UI update
      setRows(prev => {
        // Check if row already exists to avoid duplicates
        if (prev.some(r => r.id === row.id)) {
          return prev
        }
        return [row, ...prev]
      })
      
      toast({
        title: 'Row added',
        description: 'New variant row created. Add reference images to get started.'
      })
    } catch (error) {
      toast({
        title: 'Failed to add row',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
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
        <div>
          <h2 className="text-lg font-medium">Variant Rows</h2>
          {modelId && (
            <p className="text-sm text-muted-foreground mt-1">
              Variants for this model
            </p>
          )}
        </div>
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
          <div 
            className={`overflow-x-auto transition-all duration-200 ${
              isFolderDropActive ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''
            }`}
            onDragOver={handleFolderDragOver}
            onDragLeave={handleFolderDragLeave}
            onDrop={handleFolderDrop}
          >
            {/* Bulk Upload Progress Indicator */}
            {bulkUploadState.length > 0 && (
              <div className="p-4 bg-muted/50 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">
                    Uploading {bulkUploadState.filter(s => s.status === 'uploading' || s.status === 'pending').length} of {bulkUploadState.length} files
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {bulkUploadState.filter(s => s.status === 'success').length} completed, {bulkUploadState.filter(s => s.status === 'error').length} failed
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {bulkUploadState.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 truncate">{item.filename}</div>
                      <div className="flex items-center gap-2 min-w-[80px]">
                        {item.status === 'pending' && (
                          <div className="text-muted-foreground">Pending...</div>
                        )}
                        {item.status === 'uploading' && (
                          <>
                            <Spinner size="sm" />
                            <div className="text-muted-foreground">Uploading...</div>
                          </>
                        )}
                        {item.status === 'success' && (
                          <div className="text-green-600">✓ Success</div>
                        )}
                        {item.status === 'error' && (
                          <div className="text-destructive" title={item.error}>
                            ✗ Failed
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 align-top"></TableHead>
                  <TableHead className="w-32 align-top">Reference</TableHead>
                  <TableHead className="w-[20rem] md:w-[24rem] lg:w-[28rem] xl:w-[32rem] shrink-0 align-top">Prompt</TableHead>
                  <TableHead className="w-28 align-top">Generate</TableHead>
                  <TableHead className="min-w-[400px] align-top">Results</TableHead>
                  <TableHead className="w-16 align-top">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.flatMap(row => {
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
                  
                  const generatedImages = normalizedImages
                    .filter(img => {
                      // Only images explicitly marked as generated (is_generated === true)
                      // Defensive: double-check it's exactly true, not truthy
                      return img.is_generated === true
                    })
                    .sort((a, b) => {
                      // Sort generated images by created_at (oldest first) for display
                      const dateA = new Date(a.created_at || 0).getTime()
                      const dateB = new Date(b.created_at || 0).getTime()
                      return dateA - dateB // Ascending (oldest first)
                    })
                  
                  // Debug logging to help diagnose display issues - always log in development
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[VariantsWorkspace] Image classification', {
                      rowId: row.id,
                      totalImages: allImages.length,
                      referenceImages: referenceImages.length,
                      generatedImages: generatedImages.length,
                      generatedImageIds: generatedImages.map(img => img.id),
                      generatedImageFlags: generatedImages.map(img => ({ 
                        id: img.id, 
                        is_generated: img.is_generated, 
                        is_generated_type: typeof img.is_generated,
                        created_at: img.created_at,
                        output_path: img.output_path
                      })),
                      allImageFlags: allImages.map(img => ({ 
                        id: img.id, 
                        is_generated: img.is_generated,
                        is_generated_type: typeof img.is_generated,
                        is_generated_raw: (img as any).is_generated
                      }))
                    })
                    
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

                  const mainRow = (
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
                      <TableCell 
                        className={`align-top p-2 transition-all duration-200 ${
                          dragOverRefRowId === row.id ? 'bg-primary/10 ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        onDragOver={(e) => handleRefDragOver(e, row.id)}
                        onDragLeave={(e) => handleRefDragLeave(e, row.id)}
                        onDrop={(e) => handleRefDrop(e, row.id)}
                      >
                        {dragOverRefRowId === row.id && (
                          <div className="mb-2 p-2 bg-primary/20 border-2 border-dashed border-primary rounded text-center text-xs font-medium text-primary">
                            Drop images here
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          {referenceImages.slice(0, isExpanded ? 4 : 2).map((image, refIndex) => (
                            <div 
                              key={image.id} 
                              className="group relative w-32 h-32 rounded overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 hover:border-primary/50 cursor-zoom-in"
                              onClick={async (e) => {
                                e.stopPropagation()
                                const actualIndex = referenceImages.findIndex(refImg => refImg.id === image.id)
                                if (actualIndex !== -1) {
                                  setDialogState({ isOpen: true, rowId: row.id, imageIndex: actualIndex, imageType: 'reference' })
                                  // Load full resolution when opening dialog
                                  await loadThumbnail(image.id, image.output_path)
                                }
                              }}
                            >
                              {thumbnailUrls[image.id] ? (
                                <Image
                                  src={thumbnailUrls[image.id]}
                                  alt="Reference"
                                  fill
                                  sizes="128px"
                                  className="object-cover"
                                  onError={() => loadThumbnail(image.id, image.output_path)}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                </div>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteImage(row.id, image.id)
                                }}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity z-10"
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
                              rows={isExpanded ? 8 : 4}
                              className={`resize-y text-[11px] font-mono w-[20rem] md:w-[24rem] lg:w-[28rem] xl:w-[32rem] shrink-0 border-2 border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 shadow-sm hover:shadow-md focus-visible:shadow-lg transition-all duration-300 overflow-y-auto ${
                                !isExpanded ? 'max-h-[120px]' : 'max-h-[300px]'
                              }`}
                            />
                            
                            {row.prompt && row.prompt.split(/\s+/).length >= 50 && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <span className="font-medium">✓ Seedream v4 ready</span>
                                <span className="text-muted-foreground">({row.prompt.split(/\s+/).length} words)</span>
                              </div>
                            )}
                          </div>
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
                                
                                {/* Match target ratio toggle - below status indicators */}
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
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
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
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
                              <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
                                {generatedImages.slice(0, isExpanded ? 10 : 4).map((img: any, index: number) => {
                                  const isFavorited = favoritesState[img.id] ?? (img.is_favorited === true)
                                  const displayUrl = thumbnailUrls[img.id] || loaderThumbnailUrls[img.id] || ''
                                  
                                  return (
                                    <div 
                                      key={img.id} 
                                      className="relative group w-32 h-32 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        const actualIndex = generatedImages.findIndex(gImg => gImg.id === img.id)
                                        if (actualIndex !== -1) {
                                          setDialogState({ isOpen: true, rowId: row.id, imageIndex: actualIndex, imageType: 'generated' })
                                          await loadFullImage(img.id)
                                        }
                                      }}
                                    >
                                      {displayUrl ? (
                                        <Image
                                          src={displayUrl}
                                          alt="Generated"
                                          fill
                                          sizes="128px"
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
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm flex items-center justify-center">
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

                          // Ensure we have the images array - defensive check
                          const imagesToDisplay = Array.isArray(generatedImages) 
                            ? generatedImages.slice(0, isExpanded ? 10 : 4)
                            : []

                          // Debug: Log what we're about to render
                          if (process.env.NODE_ENV === 'development') {
                            console.log('[VariantsWorkspace] Rendering results column', {
                              rowId: row.id,
                              generatedImagesCount: generatedImages.length,
                              generatedImagesIsArray: Array.isArray(generatedImages),
                              isExpanded,
                              sliceLimit: isExpanded ? 10 : 4,
                              imagesToRender: imagesToDisplay.length,
                              imageIds: imagesToDisplay.map(img => img.id),
                              allGeneratedImageIds: generatedImages.map(img => img.id)
                            })
                          }

                          return (
                            <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
                              {imagesToDisplay.map((img: any, index: number) => {
                                const isFavorited = favoritesState[img.id] ?? (img.is_favorited === true)
                                const displayUrl = thumbnailUrls[img.id] || loaderThumbnailUrls[img.id] || ''
                                
                                // Debug: Log each image being rendered
                                if (process.env.NODE_ENV === 'development') {
                                  console.log('[VariantsWorkspace] Rendering image', {
                                    rowId: row.id,
                                    imageId: img.id,
                                    index,
                                    hasDisplayUrl: !!displayUrl,
                                    is_generated: img.is_generated
                                  })
                                }
                                
                                return (
                                  <div 
                                    key={`${row.id}-${img.id}-${index}`} 
                                    className="relative group w-32 h-32 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in"
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      // Find the actual index in the generatedImages array
                                      const actualIndex = generatedImages.findIndex(gImg => gImg.id === img.id)
                                      if (actualIndex !== -1) {
                                        setDialogState({ isOpen: true, rowId: row.id, imageIndex: actualIndex, imageType: 'generated' })
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
                                        sizes="128px"
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
                                <div className="flex items-center justify-center w-32 h-32 rounded bg-muted/50 border border-border/50 text-[10px] text-muted-foreground">
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

                  const enhancementRow = isExpanded && row.prompt ? (
                    <TableRow key={`enhancement-${row.id}`} className="bg-muted/20 border-t-2 border-t-primary/30">
                      <TableCell colSpan={6} className="p-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 transition-all duration-300">
                          {/* Left side: Preset chips - organized by category */}
                          <div className="space-y-2.5">
                            <div className="space-y-2">
                              {Object.entries(PRESET_ENHANCEMENTS).map(([category, presets]) => (
                                <div key={category} className="space-y-1.5">
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
                          </div>
                          
                          {/* Right side: Enhancement input */}
                          <div className="flex flex-col gap-2">
                            <div className="text-xs font-semibold text-muted-foreground">Enhancement Instructions</div>
                            <div className="flex flex-col gap-2 flex-1">
                              <Textarea
                                value={enhanceInstructions[row.id] || ''}
                                onChange={(e) => setEnhanceInstructions(prev => ({ ...prev, [row.id]: e.target.value }))}
                                placeholder="Combined instructions from selected presets (or type custom)..."
                                rows={8}
                                className="resize-y text-xs flex-1 font-mono border-2 border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 shadow-sm min-h-[200px]"
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
                                  <>
                                    <Spinner size="sm" className="mr-2" />
                                    Enhancing...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-2" />
                                    Enhance Prompt
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null

                  return [mainRow, enhancementRow].filter(Boolean)
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
            setDialogState({ isOpen: false, rowId: null, imageIndex: 0, imageType: 'generated' })
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          {dialogState.rowId && (() => {
            const currentRow = rows.find(row => row.id === dialogState.rowId)
            if (!currentRow) return null
            
            const allImages = currentRow.variant_row_images || []
            
            // Get the appropriate image array based on imageType
            let images: any[] = []
            let imageTypeLabel = ''
            if (dialogState.imageType === 'generated') {
              // Defensive filtering: only images with is_generated === true
              images = allImages.filter(img => {
                // Strict check: only include images explicitly marked as generated
                // Exclude null, undefined, false, and any other falsy values
                return img.is_generated === true
              })
              imageTypeLabel = 'Generated Image'
            } else {
              // Reference images: is_generated !== true
              images = allImages.filter(img => {
                return img.is_generated !== true
              })
              imageTypeLabel = 'Reference Image'
            }
            
            if (images.length === 0) return null
            
            const currentImage = images[dialogState.imageIndex]
            if (!currentImage) return null
            
            const isFavorited = dialogState.imageType === 'generated' 
              ? getCurrentFavoriteStatus(currentImage.id, currentImage.is_favorited)
              : false // Reference images don't have favorites
            
            // For reference images, use thumbnailUrls; for generated, prefer fullUrls
            const fullImageUrl = dialogState.imageType === 'generated'
              ? (fullUrls[currentImage.id] || thumbnailUrls[currentImage.id] || loaderThumbnailUrls[currentImage.id] || '')
              : (thumbnailUrls[currentImage.id] || '')
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {imageTypeLabel} {dialogState.imageIndex + 1} of {images.length}
                  </DialogTitle>
                </DialogHeader>
                
                {/* Favorites button - top-left overlay (only for generated images) */}
                {dialogState.imageType === 'generated' && (
                  <button 
                    onClick={() => handleToggleFavorite(currentImage.id, isFavorited)}
                    className="absolute top-4 left-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star 
                      className={`w-5 h-5 ${isFavorited ? 'fill-yellow-400 text-yellow-400' : 'text-white hover:text-yellow-300'}`} 
                    />
                  </button>
                )}
                
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
                  {dialogState.imageIndex < images.length - 1 && (
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
