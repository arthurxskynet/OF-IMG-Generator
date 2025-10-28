'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Thumb } from '@/components/ui/thumb'
import { createJobs, getSignedUrl, getStatusColor, getStatusLabel, fetchActiveJobs } from '@/lib/jobs'
import { useModelLibrary } from '@/lib/model-library'
import { Model, ModelRow, GeneratedImage } from '@/types/jobs'
import type { ModelLibraryAsset } from '@/types/library'
import { useToast } from '@/hooks/use-toast'
import { useJobPolling } from '@/hooks/use-job-polling'
import { uploadImage, validateFile } from '@/lib/client-upload'
import { createClient } from '@/lib/supabase-browser'
import { Plus, Upload, X, Sparkles, Folder, CheckCircle, XCircle, Wand2, Star, Download, Check, ChevronLeft, ChevronRight, Trash2, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { DimensionControls } from '@/components/dimension-controls'

interface ModelWorkspaceProps {
  model: Model
  rows: ModelRow[]
  sort?: string
}

interface RowState {
  id: string
  isGenerating: boolean
  isGeneratingPrompt: boolean
  signedUrls: Record<string, string>
  isLoadingResults?: boolean
  isUploadingTarget?: boolean
}

interface BulkUploadItem {
  rowId: string
  filename: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

// Simple client-side cache for signed URLs
const urlCache = new Map<string, { url: string; expires: number }>()

const LIBRARY_DRAG_TYPE = 'application/x-model-library-asset' as const

interface LibraryDragPayload {
  assetId: string
  bucket: string
  objectPath: string
  label?: string | null
}

export function ModelWorkspace({ model, rows: initialRows, sort }: ModelWorkspaceProps) {
  const { toast } = useToast()
  const supabase = createClient()
  const [rows, setRows] = useState(initialRows)
  const [currentModel, setCurrentModel] = useState(model)
  const {
    assets: libraryAssets,
    isLoading: isLibraryLoading,
    error: libraryError,
    refresh: refreshLibrary,
    createAsset: createLibraryAsset,
    deleteAsset: deleteLibraryAsset,
    copyAssetToTargets,
  } = useModelLibrary(model.id)
  const [librarySignedUrls, setLibrarySignedUrls] = useState<Record<string, string>>({})
  const libraryFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isLibraryUploading, setIsLibraryUploading] = useState(false)
  const [isLibraryDragOver, setIsLibraryDragOver] = useState(false)
  const [activeLibraryDragId, setActiveLibraryDragId] = useState<string | null>(null)

  // Memoized sorted rows to prevent unnecessary re-sorting
  const sortedRows = useMemo(() => {
    const sortOrder = sort === 'oldest' ? 1 : -1
    return [...rows].sort((a: any, b: any) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return (dateA - dateB) * sortOrder
    })
  }, [rows, sort])
  
  // Debug: Log model info
  console.log('ModelWorkspace received model:', { id: model.id, name: model.name, owner_id: model.owner_id })
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [, setDeletedRowIds] = useState<Set<string>>(new Set())
  const fileInputRefs = useRef<Record<string, HTMLInputElement>>({})

  // Folder drop state
  const [isFolderDropActive, setIsFolderDropActive] = useState(false)
  const [bulkUploadState, setBulkUploadState] = useState<BulkUploadItem[]>([])
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  
  // Target image drag and drop state
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null)
  const [, setIsDragOverTarget] = useState(false)
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false)
  const [dragOverRefRowId, setDragOverRefRowId] = useState<string | null>(null)

  // Download selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  
  // Favorites state for immediate UI updates
  const [favoritesState, setFavoritesState] = useState<Record<string, boolean>>({})
  
  // Dialog state for image navigation
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    rowId: string | null;
    imageIndex: number;
  }>({ isOpen: false, rowId: null, imageIndex: 0 })
  
  // Local prompt state for each row to prevent re-renders on typing
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({})
  
  // Initialize favorites state from data when component loads
  useEffect(() => {
    const initialFavorites: Record<string, boolean> = {}
    rows.forEach(row => {
      const images = (row as any).generated_images || []
      images.forEach((img: any) => {
        // Initialize all images, defaulting to false if undefined
        const isFav = img.is_favorited === true
        initialFavorites[img.id] = isFav
      })
    })
    setFavoritesState(initialFavorites)
  }, [rows])

  // Initialize local prompts from row data
  useEffect(() => {
    const initialPrompts: Record<string, string> = {}
    rows.forEach(row => {
      const promptValue = row.prompt_override || model.default_prompt || ''
      initialPrompts[row.id] = promptValue
    })
    setLocalPrompts(prev => ({ ...prev, ...initialPrompts }))
  }, [rows, model.default_prompt])

  useEffect(() => {
    if (libraryError) {
      toast({
        title: 'Library unavailable',
        description: libraryError,
        variant: 'destructive'
      })
    }
  }, [libraryError, toast])

  useEffect(() => {
    setLibrarySignedUrls(prev => {
      const next: Record<string, string> = {}
      libraryAssets.forEach(asset => {
        if (asset.object_path && prev[asset.object_path]) {
          next[asset.object_path] = prev[asset.object_path]
        }
      })
      return next
    })
  }, [libraryAssets])

  // Get current prompt value for a row (local state takes precedence)
  const getCurrentPrompt = useCallback((rowId: string): string => {
    return localPrompts[rowId] ?? rows.find(r => r.id === rowId)?.prompt_override ?? model.default_prompt ?? ''
  }, [localPrompts, rows, model.default_prompt])

  // Handle prompt change (only local state update - no API calls)
  const handlePromptChange = useCallback((rowId: string, value: string) => {
    setLocalPrompts(prev => ({ ...prev, [rowId]: value }))
  }, [])

  // Handle prompt blur (save to API when user is done editing)
  const handlePromptBlur = useCallback(async (rowId: string, value: string) => {
    try {
      await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_override: value || undefined
        })
      })
      
      // Update rows state after successful save
      setRows(prev => prev.map(row => 
        row.id === rowId 
          ? { ...row, prompt_override: value || undefined }
          : row
      ))
    } catch (error) {
      console.error('Failed to update prompt:', error)
      // Revert local state on error
      setLocalPrompts(prev => ({
        ...prev,
        [rowId]: rows.find(r => r.id === rowId)?.prompt_override ?? model.default_prompt ?? ''
      }))
    }
  }, [rows, model.default_prompt])
  
  // Helper function to get current favorite status (prioritizes UI state over data state)
  const getCurrentFavoriteStatus = (imageId: string, dataStatus?: boolean) => {
    // If we have UI state, use that (for immediate feedback)
    if (favoritesState[imageId] !== undefined) {
      return favoritesState[imageId]
    }
    // Otherwise fall back to data status
    return dataStatus === true
  }

  // Navigation handlers for image dialog
  const handleNavigateImage = (direction: 'prev' | 'next') => {
    if (!dialogState.rowId) return
    
    const currentRow = rows.find(row => row.id === dialogState.rowId)
    if (!currentRow) return
    
    const images = (currentRow as any).generated_images || []
    const newIndex = direction === 'prev' 
      ? Math.max(0, dialogState.imageIndex - 1)
      : Math.min(images.length - 1, dialogState.imageIndex + 1)
    
    setDialogState(prev => ({ ...prev, imageIndex: newIndex }))
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dialogState.isOpen) return
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleNavigateImage('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNavigateImage('next')
      } else if (e.key === 'Escape') {
        setDialogState({ isOpen: false, rowId: null, imageIndex: 0 })
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogState])

  // Image preloading for smooth navigation
  useEffect(() => {
    if (dialogState.isOpen && dialogState.rowId) {
      const currentRow = rows.find(row => row.id === dialogState.rowId)
      if (!currentRow) return
      
      const images = (currentRow as any).generated_images || []
      const currentRowState = rowStates[dialogState.rowId]
      if (!currentRowState) return
      
      // Preload adjacent images
      const adjacentIndexes = [
        dialogState.imageIndex - 1,
        dialogState.imageIndex + 1
      ].filter(i => i >= 0 && i < images.length)
      
      adjacentIndexes.forEach(index => {
        const image = images[index]
        const imageUrl = currentRowState.signedUrls[image.output_url]
        if (imageUrl) {
          const img = new window.Image()
          img.src = imageUrl
        }
      })
    }
  }, [dialogState, rowStates, rows])

  // Job polling hook
  // Debounce refresh to avoid redundant fetches when many jobs complete together
  const refreshTimeout = useRef<number | null>(null)
  const scheduleRefresh = () => {
    if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
    refreshTimeout.current = window.setTimeout(() => {
      refreshRowData()
      refreshTimeout.current = null
    }, 500)
  }

  const { pollingState, startPolling } = useJobPolling((jobId, status) => {
    if (['succeeded', 'failed'].includes(status)) {
      const rowId = (pollingState as any)[jobId]?.rowId as string | undefined
      if (status === 'succeeded' && rowId) {
        const current = getRowState(rowId)
        setRowStates(prev => ({
          ...prev,
          [rowId]: { ...current, isLoadingResults: true }
        }))
        refreshSingleRow(rowId).catch(() => {})
      }
      toast({
        title: status === 'succeeded' ? 'Generation Complete' : 'Generation Failed',
        description: `Job ${jobId} has ${status}`,
        variant: status === 'failed' ? 'destructive' : 'default'
      })
      scheduleRefresh()
    }
  })

  // Initialize row states
  const getRowState = (rowId: string): RowState => {
    if (!rowStates[rowId]) {
      setRowStates(prev => ({
        ...prev,
        [rowId]: {
          id: rowId,
          isGenerating: false,
          isGeneratingPrompt: false,
          signedUrls: {},
          isLoadingResults: false
        }
      }))
      return {
        id: rowId,
        isGenerating: false,
        isGeneratingPrompt: false,
        signedUrls: {},
        isLoadingResults: false
      }
    }
    return rowStates[rowId]
  }

  // Function to get signed URL for an image path with caching
  const getImageUrl = useCallback(async (path: string, rowId?: string) => {
    // Check cache first
    const cached = urlCache.get(path)
    if (cached && cached.expires > Date.now()) {
      // Update local state if we have a rowId
      if (rowId) {
        setRowStates(prev => ({
          ...prev,
          [rowId]: {
            ...prev[rowId],
            signedUrls: { ...prev[rowId]?.signedUrls, [path]: cached.url }
          }
        }))
      } else {
        setLibrarySignedUrls(prev => ({ ...prev, [path]: cached.url }))
      }
      return cached.url
    }

    // Check local state as fallback
    const rowState = rowId ? getRowState(rowId) : null
    if (rowState?.signedUrls[path]) return rowState.signedUrls[path]
    if (!rowId && librarySignedUrls[path]) return librarySignedUrls[path]

    try {
      const { url } = await getSignedUrl(path)

      // Cache the URL (expires in 3.5 hours to be safe)
      urlCache.set(path, { url, expires: Date.now() + (3.5 * 60 * 60 * 1000) })

      // Update local state
      if (rowId) {
        setRowStates(prev => ({
          ...prev,
          [rowId]: {
            ...prev[rowId],
            signedUrls: { ...prev[rowId]?.signedUrls, [path]: url }
          }
        }))
      } else {
        setLibrarySignedUrls(prev => ({ ...prev, [path]: url }))
      }
      return url
    } catch (error) {
      console.error('Failed to get signed URL:', error)
      return ''
    }
  }, [rowStates, librarySignedUrls])

  // Lazy load signed URLs only when images become visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement
            const path = img.dataset.imagePath
            const rowId = img.dataset.rowId

            if (path) {
              getImageUrl(path, rowId || undefined).catch(() => {})
            }
          }
        })
      },
      {
        rootMargin: '50px', // Start loading 50px before image becomes visible
        threshold: 0.1
      }
    )

    // Observe all image elements with data attributes
    const imageElements = document.querySelectorAll('[data-image-path]')
    imageElements.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
    }
  }, [rows, libraryAssets, getImageUrl])

  // On mount: resume active jobs and setup realtime
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const active = await fetchActiveJobs(model.id)
        if (cancelled) return
        for (const j of active) {
          startPolling(j.job_id, j.status, j.row_id)
        }
      } catch {}
    }
    run()
    // Realtime subscription to jobs updates for this model
    try {
      const channel = supabase.channel(`jobs-model-${model.id}`)
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `model_id=eq.${model.id}`
      }, (payload: any) => {
        const next = payload?.new
        if (!next) return
        const s = String(next.status)
        if (['queued','submitted','running','saving'].includes(s)) {
          startPolling(String(next.id), s, String(next.row_id))
        }
        if (['succeeded','failed'].includes(s)) {
          scheduleRefresh()
        }
      })
      .subscribe()
      // Store channel on window to avoid unused var; cleanup on unmount
      ;(window as any).__jobsRealtime = channel
    } catch {}
    return () => { cancelled = true
      try {
        if ((window as any).__jobsRealtime) {
          supabase.removeChannel((window as any).__jobsRealtime)
          ;(window as any).__jobsRealtime = null
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id])

  // Derived live status and progress
  const getLiveStatusForRow = (rowId: string, base: string) => {
    const live = Object.values(pollingState).find(s => s.rowId === rowId && s.polling)
    if (!live) return base
    if (live.status === 'succeeded') return 'done'
    if (live.status === 'failed') return 'error'
    return String(live.status)
  }

  const statusToProgress = (status: string): number => {
    switch (status) {
      case 'queued': return 15
      case 'submitted': return 35
      case 'running': return 75
      case 'saving': return 90
      case 'done':
      case 'succeeded':
      case 'failed': return 100
      default: return 0
    }
  }

  const isActiveStatus = (s: string) => ['queued','submitted','running','saving'].includes(s)

  // Refresh row data after generation
  const refreshRowData = async () => {
    try {
      const url = new URL(`/api/models/${model.id}`, window.location.origin)
      const currentSort = new URLSearchParams(window.location.search).get('sort')
      if (currentSort) {
        url.searchParams.set('sort', currentSort)
      }
      
      const response = await fetch(url.toString(), { cache: 'no-store' })
      if (response.ok) {
        const { model: updatedModel } = await response.json()
        setRows(updatedModel.model_rows || [])
      }
    } catch (error) {
      console.error('Failed to refresh row data:', error)
    }
  }

  // Refresh a single row and prefetch its image URLs; clear loading flag
  const refreshSingleRow = async (rowId: string) => {
    try {
      const res = await fetch(`/api/rows/${rowId}`, { cache: 'no-store' })
      if (!res.ok) return
      const { row } = await res.json()
      setRows(prev => prev.map(r => (r.id === rowId ? row : r)))
      const images = (row as any).generated_images || []
      for (const img of images) {
        await getImageUrl(img.output_url, rowId)
      }
    } catch (e) {
      // noop
    } finally {
      setRowStates(prev => ({
        ...prev,
        [rowId]: { ...getRowState(rowId), isLoadingResults: false }
      }))
    }
  }

  // Add new row
  const handleAddRow = async () => {
    // Create skeleton row for instant UI feedback
    const tempId = `temp-${Date.now()}`
    const skeletonRow = {
      id: tempId,
      model_id: model.id,
      ref_image_urls: undefined,
      target_image_url: '',
      prompt_override: undefined,
      status: 'idle' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isSkeleton: true // Flag to identify skeleton rows
    } as ModelRow & { isSkeleton: boolean }

    // Determine position based on sort order
    const isNewestFirst = !sort || sort === 'newest'
    
    // Add skeleton row at correct position
    setRows(prev => {
      if (isNewestFirst) {
        return [skeletonRow, ...prev] // Add to top for newest first
      } else {
        return [...prev, skeletonRow] // Add to bottom for oldest first
      }
    })

    try {
      const response = await fetch('/api/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: model.id
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create row')
      }

      const { row } = await response.json()
      
      // Replace skeleton with real row data
      setRows(prev => prev.map(r => r.id === tempId ? row : r))
      
      toast({
        title: 'Row added',
        description: 'New row created. Upload a target image to get started.'
      })
    } catch (error) {
      // Remove skeleton row on error
      setRows(prev => prev.filter(r => r.id !== tempId))
      
      toast({
        title: 'Failed to add row',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  // Handle file upload for target image
  const handleTargetImageUpload = async (file: File, rowId: string) => {
    // Set loading state
    setRowStates(prev => ({
      ...prev,
      [rowId]: { ...getRowState(rowId), isUploadingTarget: true }
    }))

    try {
      validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Use retry logic for single image upload
      await retryWithBackoff(async () => {
        // Refresh auth token before upload
        await refreshAuth()
        
        const result = await uploadImage(file, 'targets', user.id)
        
        // Update row with new target image
        const response = await fetch(`/api/rows/${rowId}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            target_image_url: result.objectPath
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update row: ${response.status} ${errorText}`)
        }

        const { row } = await response.json()
        setRows(prev => prev.map(r => r.id === rowId ? row : r))
      }, 3, 1000)
      
      toast({
        title: 'Image uploaded',
        description: 'Target image uploaded successfully'
      })
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload image',
        variant: 'destructive'
      })
    } finally {
      // Clear loading state
      setRowStates(prev => ({
        ...prev,
        [rowId]: { ...getRowState(rowId), isUploadingTarget: false }
      }))
    }
  }

  const handleReferenceImageUpload = async (rowId: string, files: File[]): Promise<boolean> => {
    if (!files.length) return false

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const uploadPromises = files.map(file => {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10)
        return retryWithBackoff(async () => {
          await refreshAuth()
          return uploadImage(file, 'refs', user.id)
        }, 3, 1000)
      })

      const results = await Promise.all(uploadPromises)
      const row = rows.find(r => r.id === rowId)
      const existingRefs = row?.ref_image_urls || []
      const appendedRefs = [...existingRefs, ...results.map(r => r.objectPath)]
      const newRefs = Array.from(new Set(appendedRefs))
      let updatedRow: ModelRow | null = null

      await retryWithBackoff(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(`/api/rows/${rowId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ ref_image_urls: newRefs })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update row: ${response.status} ${errorText}`)
        }

        const { row: nextRow } = await response.json()
        updatedRow = nextRow
      }, 3, 1000)

      if (updatedRow) {
        setRows(prev => prev.map(r => r.id === rowId ? updatedRow! : r))
      } else {
        setRows(prev => prev.map(r => r.id === rowId ? { ...r, ref_image_urls: newRefs } : r))
      }

      const newPaths = results
        .map(r => r.objectPath)
        .filter(path => !existingRefs.includes(path))

      await Promise.all(newPaths.map(path => getImageUrl(path, rowId)))

      toast({ title: `Added ${files.length} reference image${files.length === 1 ? '' : 's'}` })
      return true
    } catch (err) {
      toast({
        title: 'Ref upload failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive'
      })
      return false
    }
  }

  const hasImageFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.items || []).some(item => item.kind === 'file' && item.type.startsWith('image/'))

  const isLibraryDrag = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types || []).includes(LIBRARY_DRAG_TYPE)

  const getLibraryDragData = (event: React.DragEvent): LibraryDragPayload | null => {
    try {
      const raw = event.dataTransfer.getData(LIBRARY_DRAG_TYPE)
      if (!raw) return null
      const parsed = JSON.parse(raw) as LibraryDragPayload
      if (!parsed.assetId || !parsed.bucket || !parsed.objectPath) {
        return null
      }
      return parsed
    } catch (error) {
      console.warn('Failed to parse library drag payload:', error)
      return null
    }
  }

  const handleLibraryTargetDrop = async (rowId: string, payload: LibraryDragPayload) => {
    const initialRowState = rowStates[rowId] ?? getRowState(rowId)
    setRowStates(prev => ({
      ...prev,
      [rowId]: { ...initialRowState, isUploadingTarget: true }
    }))

    try {
      await refreshAuth().catch(() => {})
      const { objectPath } = await copyAssetToTargets(payload.assetId)
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ target_image_url: objectPath })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to update row: ${response.status} ${errorText}`)
      }

      const { row } = await response.json()
      setRows(prev => prev.map(r => r.id === rowId ? row : r))
      await getImageUrl(objectPath, rowId)

      toast({
        title: 'Target image updated',
        description: payload.label ? `Copied ${payload.label}` : 'Library image copied to target slot.'
      })
    } catch (error) {
      toast({
        title: 'Failed to use library asset',
        description: error instanceof Error ? error.message : 'Unable to copy library asset.',
        variant: 'destructive'
      })
    } finally {
      setRowStates(prev => ({
        ...prev,
        [rowId]: { ...(prev[rowId] ?? initialRowState), isUploadingTarget: false }
      }))
    }
  }

  const handleLibraryReferenceDrop = async (rowId: string, payload: LibraryDragPayload) => {
    const row = rows.find(r => r.id === rowId)
    if (!row) return

    const existingRefs = row.ref_image_urls || []
    if (existingRefs.includes(payload.objectPath)) {
      toast({
        title: 'Reference already added',
        description: 'This library image is already attached to the row.',
      })
      return
    }

    const newRefs = [...existingRefs, payload.objectPath]

    try {
      await refreshAuth().catch(() => {})
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ ref_image_urls: newRefs })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to update row: ${response.status} ${errorText}`)
      }

      const { row: updatedRow } = await response.json()
      setRows(prev => prev.map(r => r.id === rowId ? updatedRow : r))
      await getImageUrl(payload.objectPath, rowId)

      toast({
        title: 'Reference added',
        description: payload.label ? `Added ${payload.label}` : 'Library image added to references.'
      })
    } catch (error) {
      toast({
        title: 'Failed to add reference',
        description: error instanceof Error ? error.message : 'Unable to add library image to row.',
        variant: 'destructive'
      })
    }
  }

  const handleLibraryUpload = async (files: File[]) => {
    if (!files.length) return

    setIsLibraryUploading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const uploaded: ModelLibraryAsset[] = []

      for (const file of files) {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 10)
        const uploadResult = await uploadImage(file, 'library', user.id)
        const asset = await createLibraryAsset({
          bucket: uploadResult.bucket,
          objectPath: uploadResult.objectPath,
          label: file.name
        })
        uploaded.push(asset)
        await getImageUrl(asset.object_path)
      }

      if (uploaded.length > 0) {
        toast({
          title: uploaded.length === 1 ? 'Library image added' : `${uploaded.length} library images added`,
          description: 'Drag assets onto targets or references to use them.'
        })
      }
    } catch (error) {
      toast({
        title: 'Library upload failed',
        description: error instanceof Error ? error.message : 'Unable to upload to library.',
        variant: 'destructive'
      })
    } finally {
      setIsLibraryUploading(false)
      setIsLibraryDragOver(false)
      if (libraryFileInputRef.current) {
        libraryFileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteLibraryAsset = async (asset: ModelLibraryAsset) => {
    try {
      await deleteLibraryAsset(asset.id)
      setLibrarySignedUrls(prev => {
        const next = { ...prev }
        delete next[asset.object_path]
        return next
      })
      toast({
        title: 'Library asset removed',
        description: asset.label ? `Deleted ${asset.label}` : 'Asset removed from library.'
      })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete library asset.',
        variant: 'destructive'
      })
    }
  }

  const handleLibraryDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsLibraryDragOver(false)

    if (isLibraryUploading) {
      toast({
        title: 'Upload in progress',
        description: 'Please wait for the current upload to finish before adding more assets.',
        variant: 'destructive'
      })
      return
    }

    if (!event.dataTransfer?.files?.length) return

    const imageFiles = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    if (!imageFiles.length) return

    await handleLibraryUpload(imageFiles)
  }

  const handleLibraryAreaDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (isLibraryDrag(event)) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    if (isLibraryUploading) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    if (!hasImageFiles(event)) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsLibraryDragOver(true)
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleLibraryAreaDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsLibraryDragOver(false)
    }
  }

  const handleRefDragOver = (event: React.DragEvent, rowId: string) => {
    if (!isLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDragOverRefRowId(rowId)
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleRefDragLeave = (event: React.DragEvent, rowId: string) => {
    if (!isLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragOverRefRowId(prev => (prev === rowId ? null : prev))
    }
  }

  const handleRefDrop = (event: React.DragEvent, rowId: string) => {
    if (isLibraryDrag(event)) {
      event.preventDefault()
      event.stopPropagation()
      setDragOverRefRowId(null)
      setActiveLibraryDragId(null)
      const payload = getLibraryDragData(event)
      if (!payload) return
      handleLibraryReferenceDrop(rowId, payload)
      return
    }

    const files = Array.from(event.dataTransfer.files || []).filter(file => file.type.startsWith('image/'))
    if (!files.length) return

    event.preventDefault()
    event.stopPropagation()
    handleReferenceImageUpload(rowId, files).catch(() => {})
  }

  // Handle drag and drop for target images
  const handleTargetDragOver = (e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()

    const rowState = getRowState(rowId)

    if (rowState.isUploadingTarget) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    if (isLibraryDrag(e)) {
      setDragOverRowId(rowId)
      e.dataTransfer.dropEffect = 'copy'
      return
    }

    if (hasImageFiles(e)) {
      setDragOverRowId(rowId)
      setIsDragOverTarget(true)
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  const handleTargetDragLeave = (e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Only clear drag state if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverRowId(null)
      setIsDragOverTarget(false)
    }
  }

  const handleTargetDrop = (e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()

    const rowState = getRowState(rowId)

    // Don't allow drop if already uploading
    if (rowState.isUploadingTarget) {
      toast({
        title: 'Upload in progress',
        description: 'Please wait for the current upload to complete',
        variant: 'destructive'
      })
      return
    }

    const libraryPayload = getLibraryDragData(e)

    // Clear drag state
    setDragOverRowId(null)
    setIsDragOverTarget(false)
    setIsGlobalDragActive(false)
    setActiveLibraryDragId(null)

    if (libraryPayload) {
      handleLibraryTargetDrop(rowId, libraryPayload)
      return
    }

    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(file => file.type.startsWith('image/'))

    if (imageFile) {
      handleTargetImageUpload(imageFile, rowId)
    } else {
      toast({
        title: 'Invalid file type',
        description: 'Please drop an image file (JPEG, PNG, WebP)',
        variant: 'destructive'
      })
    }
  }

  // Global drag handlers for the table
  const handleTableDragOver = (e: React.DragEvent) => {
    if (isLibraryDrag(e)) {
      e.preventDefault()
      e.stopPropagation()
      setIsGlobalDragActive(false)
      e.dataTransfer.dropEffect = 'copy'
      return
    }

    e.preventDefault()
    e.stopPropagation()

    if (hasImageFiles(e)) {
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

  // Extract all image files from dropped items (supports folders)
  const extractImageFiles = async (dataTransfer: DataTransfer): Promise<File[]> => {
    const imageFiles: File[] = []
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    
    const processItem = async (item: DataTransferItem): Promise<void> => {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.() || (item as any).getAsEntry?.()
        
        if (entry) {
          if (entry.isFile) {
            const file = item.getAsFile()
            if (file && allowedTypes.includes(file.type)) {
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
        }
      }
    }

    // Process all items
    for (let i = 0; i < dataTransfer.items.length; i++) {
      await processItem(dataTransfer.items[i])
    }

    // Sort alphabetically by filename
    return imageFiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  const handleFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFolderDropActive(false)
    
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

  // Helper function to upload a single image with retry logic and improved auth handling
  const uploadSingleImage = async (row: any, file: File, user: any): Promise<void> => {
    return retryWithBackoff(async () => {
      // Refresh auth token before each upload to prevent expiry
      try {
        await refreshAuth()
      } catch (authError) {
        console.warn('Auth refresh failed, continuing with current session:', authError)
        // Continue with current session - it might still be valid
      }
      
      // Get fresh session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No valid authentication session')
      }
      
      // Upload the image with timeout handling
      const uploadPromise = uploadImage(file, 'targets', user.id)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout after 30 seconds')), 30000)
      )
      
      const result = await Promise.race([uploadPromise, timeoutPromise]) as any
      
      // Update the row with the uploaded image
      const updateResponse = await fetch(`/api/rows/${row.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          target_image_url: result.objectPath
        })
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        throw new Error(`Failed to update row for ${file.name}: ${updateResponse.status} ${errorText}`)
      }

      const { row: updatedRow } = await updateResponse.json()
      
      // Update the row in the UI
      setRows(prev => prev.map(r => r.id === row.id ? updatedRow : r))
    }, 5, 2000) // Increased retries and base delay for production stability
  }

  // Fallback client-side bulk upload with improved error handling
  const handleBulkImageUploadClientSide = async (imageFiles: File[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      console.log('Client-side bulk upload starting for model:', model.id, 'user:', user.id, 'files:', imageFiles.length);

      // Step 1: Create all rows first with improved retry logic
      const createRowPromises = imageFiles.map(async (file, index) => {
        return retryWithBackoff(async () => {
          console.log('Creating row for file:', file.name, 'model:', model.id, 'index:', index);
          
          // Add staggered delay to prevent overwhelming the API
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 100))
          }
          
          const response = await fetch('/api/rows', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
            },
            body: JSON.stringify({
              model_id: model.id
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('Row creation failed:', { file: file.name, status: response.status, error: errorText });
            throw new Error(`Failed to create row for ${file.name}: ${response.status} ${errorText}`)
          }

          const { row } = await response.json()
          console.log('Row created successfully:', row.id);
          return { row, file }
        }, 5, 2000) // Increased retries and base delay for production
      })

      const createdRows = await Promise.all(createRowPromises)
      
      // Initialize bulk upload state
      const initialBulkState: BulkUploadItem[] = createdRows.map(({ row, file }) => ({
        rowId: row.id,
        filename: file.name,
        status: 'pending',
        progress: 0
      }))
      setBulkUploadState(initialBulkState)

      // Add new rows to the UI immediately
      setRows(prev => [...prev, ...createdRows.map(({ row }) => row)])

      // Step 2: Upload images in smaller batches with longer delays for production stability
      const BATCH_SIZE = 2 // Reduced batch size for production
      const batches = []
      for (let i = 0; i < createdRows.length; i += BATCH_SIZE) {
        batches.push(createdRows.slice(i, i + BATCH_SIZE))
      }

      let successCount = 0
      let errorCount = 0

      for (const [batchIndex, batch] of batches.entries()) {
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} files`)
        
        const batchPromises = batch.map(async ({ row, file }, fileIndex) => {
          try {
            // Update status to uploading
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { ...item, status: 'uploading', progress: 0 }
                : item
            ))

            // Add staggered delay within batch to prevent rate limiting
            if (fileIndex > 0) {
              await new Promise(resolve => setTimeout(resolve, fileIndex * 200))
            }

            await uploadSingleImage(row, file, user)
            
            // Update bulk upload state to success
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { ...item, status: 'success', progress: 100 }
                : item
            ))

            return { success: true, filename: file.name }
          } catch (error) {
            console.error(`Error uploading ${file.name}:`, error)
            
            // Update bulk upload state to error
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { 
                    ...item, 
                    status: 'error', 
                    progress: 0,
                    error: error instanceof Error ? error.message : 'Upload failed'
                  }
                : item
            ))

            return { success: false, filename: file.name, error }
          }
        })

        // Wait for current batch to complete before starting next batch
        const batchResults = await Promise.all(batchPromises)
        
        // Count results
        batchResults.forEach(result => {
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        })

        // Longer delay between batches in production to prevent overwhelming the server
        if (batchIndex < batches.length - 1) {
          console.log(`Waiting 2 seconds before next batch...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      // Show completion toast
      if (successCount > 0) {
        toast({
          title: 'Bulk upload completed',
          description: `Successfully uploaded ${successCount} image${successCount === 1 ? '' : 's'}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          variant: errorCount > 0 ? 'destructive' : 'default'
        })
      }

      // Clear bulk upload state after a delay
      setTimeout(() => {
        setBulkUploadState([])
      }, 5000)

    } catch (error) {
      console.error('Client-side bulk upload error:', error)
      toast({
        title: 'Bulk upload failed',
        description: error instanceof Error ? error.message : 'Failed to process bulk upload',
        variant: 'destructive'
      })
      setBulkUploadState([])
    }
  }

  // Handle bulk image upload using server-side processing for better production stability
  const handleBulkImageUpload = async (imageFiles: File[]) => {
    setIsBulkUploading(true)
    setBulkUploadState([])

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      console.log('Bulk upload starting for model:', model.id, 'user:', user.id, 'files:', imageFiles.length);

      // Initialize bulk upload state for UI feedback
      const initialBulkState: BulkUploadItem[] = imageFiles.map((file, index) => ({
        rowId: `temp-${index}`, // Temporary ID for UI
        filename: file.name,
        status: 'pending',
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

      // Try server-side bulk upload first, fallback to client-side if it fails
      let response: Response | null = null
      let useServerSide = true
      
      try {
        response = await fetch('/api/upload/bulk', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            model_id: model.id,
            files: filesData
          })
        })

        if (!response.ok) {
          throw new Error(`Server-side bulk upload failed: ${response.status}`)
        }
      } catch (serverError) {
        console.warn('Server-side bulk upload failed, falling back to client-side:', serverError)
        useServerSide = false
      }

      if (!useServerSide || !response) {
        // Fallback to original client-side approach with improved error handling
        return await handleBulkImageUploadClientSide(imageFiles)
      }

      const result = await response.json()
      console.log('Bulk upload result:', result)

      // Update UI with results
      const updatedBulkState: BulkUploadItem[] = imageFiles.map((file, index) => {
        const successResult = result.results.find((r: any) => r.filename === file.name)
        const errorResult = result.errors.find((e: any) => e.filename === file.name)
        
        if (successResult) {
          return {
            rowId: successResult.row.id,
            filename: file.name,
            status: 'success',
            progress: 100
          }
        } else if (errorResult) {
          return {
            rowId: `temp-${index}`,
            filename: file.name,
            status: 'error',
            progress: 0,
            error: errorResult.error
          }
        } else {
          return {
            rowId: `temp-${index}`,
            filename: file.name,
            status: 'error',
            progress: 0,
            error: 'Unknown error'
          }
        }
      })
      setBulkUploadState(updatedBulkState)

      // Add successful rows to the UI
      if (result.results.length > 0) {
        setRows(prev => [...prev, ...result.results.map((r: any) => r.row)])
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

    } catch (error) {
      console.error('Bulk upload error:', error)
      toast({
        title: 'Bulk upload failed',
        description: error instanceof Error ? error.message : 'Failed to process bulk upload',
        variant: 'destructive'
      })
      setBulkUploadState([])
    } finally {
      setIsBulkUploading(false)
    }
  }


  // AI Prompt Generation (using queue system)
  const handleAiPromptGeneration = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId)
    
    // Validate target image exists (reference images are optional)
    if (!row?.target_image_url) {
      toast({
        title: 'Missing target image',
        description: 'Target image is required for AI prompt generation',
        variant: 'destructive'
      })
      return
    }

    // Set loading state
    setRowStates(prev => ({
      ...prev,
      [rowId]: { ...getRowState(rowId), isGeneratingPrompt: true }
    }))

    try {
      // Build reference images array using same logic as direct API route
      // If ref_image_urls is explicitly set (even if empty), use it
      // If ref_image_urls is null/undefined, fallback to model default
      const refImages = row.ref_image_urls !== null && row.ref_image_urls !== undefined
        ? row.ref_image_urls  // Use row's ref images (could be empty array if user removed all refs)
        : model.default_ref_headshot_url 
          ? [model.default_ref_headshot_url]  // Fallback to model default
          : []  // No references at all

      console.log('[Frontend] Reference images logic:', {
        rowRefImageUrls: row.ref_image_urls,
        modelDefaultRef: model.default_ref_headshot_url,
        finalRefImages: refImages,
        refImagesLength: refImages.length
      })

      // Convert storage paths to signed URLs for Grok API access
      const refSignedUrls = await Promise.all(
        refImages.map(path => getSignedUrl(path).then(r => r.url))
      )
      const targetSignedUrl = await getSignedUrl(row.target_image_url).then(r => r.url)

      console.log('[Frontend] After URL signing:', {
        refSignedUrls: refSignedUrls,
        refSignedUrlsLength: refSignedUrls.length,
        targetSignedUrl: targetSignedUrl,
        operationType: refSignedUrls.length > 0 ? 'face-swap' : 'target-only'
      })

      // Enqueue prompt generation request
      const response = await fetch('/api/prompt/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rowId,
          refUrls: refSignedUrls,  // Full signed URLs
          targetUrl: targetSignedUrl,  // Full signed URL
          priority: 8 // High priority for user-initiated requests
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to enqueue prompt generation')
      }

      const { promptJobId, estimatedWaitTime } = await response.json()
      
      toast({
        title: 'AI prompt generation queued',
        description: `Your request has been queued. Estimated wait time: ${Math.ceil(estimatedWaitTime / 60)} minutes`
      })

      // Start polling for completion
      pollPromptGeneration(rowId, promptJobId)

    } catch (error) {
      toast({
        title: 'AI generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
      
      setRowStates(prev => ({
        ...prev,
        [rowId]: { ...getRowState(rowId), isGeneratingPrompt: false }
      }))
    }
  }

  // Poll for prompt generation completion
  const pollPromptGeneration = async (rowId: string, promptJobId: string) => {
    const maxAttempts = 60 // Poll for up to 5 minutes (5 second intervals)
    let attempts = 0

    const poll = async () => {
      try {
        const response = await fetch(`/api/prompt/queue/${promptJobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to check prompt status')
        }

        const { status, generatedPrompt, error } = await response.json()

        if (status === 'completed' && generatedPrompt) {
          // Update the prompt immediately (automatic replacement)
          setLocalPrompts(prev => ({ ...prev, [rowId]: generatedPrompt }))
          await handlePromptBlur(rowId, generatedPrompt)
          
          toast({
            title: 'AI prompt generated',
            description: 'Prompt has been updated with AI-generated content'
          })

          setRowStates(prev => ({
            ...prev,
            [rowId]: { ...getRowState(rowId), isGeneratingPrompt: false }
          }))
          return
        }

        if (status === 'failed') {
          throw new Error(error || 'Prompt generation failed')
        }

        // Still processing, continue polling
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000) // Poll every 5 seconds
        } else {
          throw new Error('Prompt generation timed out')
        }

      } catch (error) {
        toast({
          title: 'AI generation failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive'
        })
        
        setRowStates(prev => ({
          ...prev,
          [rowId]: { ...getRowState(rowId), isGeneratingPrompt: false }
        }))
      }
    }

    // Start polling
    poll()
  }

  // Helper function to check if row has valid images for AI generation
  const hasValidImages = (row: ModelRow): boolean => {
    const hasTarget = Boolean(row?.target_image_url)
    return hasTarget
  }

  // Removed generation count: provider does not support count parameter

  // Handle generation
  const handleGenerate = useCallback(async (rowId: string, useAiPrompt: boolean = false) => {
    const row = rows.find(r => r.id === rowId)
    if (!row?.target_image_url) {
      toast({
        title: 'Missing target image',
        description: 'Upload a target image first',
        variant: 'destructive'
      })
      return
    }

    const rowState = getRowState(rowId)
    setRowStates(prev => ({
      ...prev,
      [rowId]: { ...rowState, isGenerating: true }
    }))

    try {
      // Optimistically mark status as queued for instant feedback
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, status: 'queued' as any } : r))
      
      // Create job with optional AI prompt generation
      const result = await createJobs({ rowId, useAiPrompt })
      const ids = result.jobIds || []
      if (ids[0]) startPolling(ids[0], 'submitted', rowId)
      
      const message = useAiPrompt 
        ? `Queued ${ids.length} task${ids.length === 1 ? '' : 's'} with AI prompt generation`
        : `Queued ${ids.length} task${ids.length === 1 ? '' : 's'}`
      
      toast({
        title: 'Generation started',
        description: message
      })
    } catch (error) {
      // Revert optimistic status on error
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, status: 'idle' as any } : r))
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to create generation job',
        variant: 'destructive'
      })
    } finally {
      setRowStates(prev => ({
        ...prev,
        [rowId]: { ...getRowState(rowId), isGenerating: false }
      }))
    }
  }, [rows, getRowState, setRowStates, toast, createJobs, startPolling])

  // Remove row
  const handleRemoveRow = useCallback(async (rowId: string) => {
    try {
      await fetch(`/api/rows/${rowId}`, { method: 'DELETE' })
      setRows(prev => prev.filter(r => r.id !== rowId))
      setRowStates(prev => {
        const { [rowId]: _removed, ...rest } = prev
        return rest
      })
      setDeletedRowIds(prev => {
        const next = new Set(prev)
        next.add(rowId)
        return next
      })
      toast({
        title: 'Row removed',
        description: 'Row deleted successfully'
      })
    } catch (error) {
      toast({
        title: 'Failed to remove row',
        description: 'Could not delete row',
        variant: 'destructive'
      })
    }
  }, [setRows, setRowStates, setDeletedRowIds, toast])

  // Toggle favorite status for a generated image
  const handleToggleFavorite = useCallback(async (imageId: string, currentStatus: boolean | undefined) => {
    try {
      // Handle case where currentStatus might be undefined (default to false)
      const newStatus = currentStatus === true ? false : true
      
      // Immediately update the UI state for instant feedback
      setFavoritesState(prev => {
        const newState = {
          ...prev,
          [imageId]: newStatus
        }
        return newState
      })
      
      const response = await fetch(`/api/images/${imageId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorited: newStatus })
      })

      if (response.ok) {
        const { is_favorited } = await response.json()
        
        // Update the main rows state to keep it in sync
        setRows(prev => {
          const updatedRows = prev.map(row => {
            const updatedImages = (row as any).generated_images?.map((img: any) => {
              if (img.id === imageId) {
                return { ...img, is_favorited }
              }
              return img
            }) || []
            
            return {
              ...row,
              generated_images: updatedImages
            }
          })
          return updatedRows
        })

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
        description: error instanceof Error ? error.message : 'Could not update favorite status',
        variant: 'destructive'
      })
    }
  }, [setFavoritesState, setRows, toast])

  // Helper functions for download selection
  const getAllImageIds = (): string[] => {
    const allIds: string[] = []
    rows.forEach(row => {
      const images = (row as any).generated_images || []
      images.forEach((image: GeneratedImage) => {
        allIds.push(image.id)
      })
    })
    return allIds
  }

  const handleSelectAll = () => {
    const allIds = getAllImageIds()
    if (selectedImageIds.size === allIds.length) {
      // Deselect all
      setSelectedImageIds(new Set())
    } else {
      // Select all
      setSelectedImageIds(new Set(allIds))
    }
  }

  const handleToggleImageSelection = (imageId: string) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  const handleDownloadSelected = async () => {
    if (selectedImageIds.size === 0) {
      toast({
        title: 'No images selected',
        description: 'Please select at least one image to download',
        variant: 'destructive'
      })
      return
    }

    setIsDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // Fetch each selected image and add to zip
      for (const imageId of selectedImageIds) {
        // Find the image in rows
        let image: GeneratedImage | null = null
        let signedUrl = ''
        
        for (const row of rows) {
          const images = (row as any).generated_images || []
          const foundImage = images.find((img: GeneratedImage) => img.id === imageId)
          if (foundImage) {
            image = foundImage
            signedUrl = rowStates[row.id]?.signedUrls[foundImage.output_url] || ''
            break
          }
        }

        if (image && signedUrl) {
          try {
            // Fetch the image as blob
            const response = await fetch(signedUrl)
            const blob = await response.blob()
            
            // Determine file extension from content type or URL
            const extension = blob.type.includes('png') ? 'png' : 
                            blob.type.includes('webp') ? 'webp' : 'jpg'
            
            // Add to zip with a meaningful filename
            const filename = `image-${image.id.slice(0, 8)}.${extension}`
            zip.file(filename, blob)
          } catch (error) {
            console.error(`Failed to fetch image ${imageId}:`, error)
          }
        }
      }

      // Generate and download zip
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'Download started',
        description: `Downloading ${selectedImageIds.size} image${selectedImageIds.size === 1 ? '' : 's'} as ZIP file`
      })

      // Clear selections after download
      setSelectedImageIds(new Set())
      setIsSelectionMode(false)

    } catch (error) {
      console.error('Download failed:', error)
      toast({
        title: 'Download failed',
        description: 'Could not create ZIP file. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedImageIds.size === 0) {
      toast({
        title: 'No images selected',
        description: 'Please select at least one image to delete',
        variant: 'destructive'
      })
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/images/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageIds: Array.from(selectedImageIds)
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete images')
      }

      // Update local state to remove deleted images from rows
      setRows(prevRows => 
        prevRows.map(row => ({
          ...row,
          generated_images: (row as any).generated_images?.filter(
            (img: GeneratedImage) => !selectedImageIds.has(img.id)
          ) || []
        }))
      )

      toast({
        title: 'Images deleted successfully',
        description: `Deleted ${result.summary.imagesDeleted} image${result.summary.imagesDeleted === 1 ? '' : 's'}`
      })

      // Clear selections after deletion
      setSelectedImageIds(new Set())
      setIsSelectionMode(false)

    } catch (error) {
      console.error('Delete failed:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete images. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Summary with Folder Drop Zone */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">Status overview</div>
            
            {/* Compact Folder Drop Zone */}
            <div
              className={`relative transition-all duration-200 rounded-lg border-2 border-dashed px-4 py-2 min-w-[200px] ${
                isFolderDropActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
              onDragOver={handleFolderDragOver}
              onDragLeave={handleFolderDragLeave}
              onDrop={handleFolderDrop}
            >
              {isBulkUploading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <div className="text-xs">
                    <div className="font-medium">Processing...</div>
                    {bulkUploadState.length > 0 && (
                      <div className="text-muted-foreground">
                        {bulkUploadState.filter(item => item.status === 'uploading').length} of {bulkUploadState.length}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <div className="text-xs">
                    <div className="font-medium">
                      {isFolderDropActive ? 'Drop folder' : 'Drop folder'}
                    </div>
                    <div className="text-muted-foreground">Bulk upload</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-3 flex gap-6 flex-wrap">
            {(() => {
              const counts = rows.reduce((acc, row) => {
                const status = getLiveStatusForRow(row.id, row.status)
                if (['queued', 'submitted'].includes(status)) acc.queued++
                else if (['running', 'saving'].includes(status)) acc.processing++
                else if (['done', 'succeeded'].includes(status)) acc.completed++
                else if (['failed', 'error'].includes(status)) acc.failed++
                return acc
              }, { queued: 0, processing: 0, completed: 0, failed: 0 })
              
              return (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <span className="text-sm font-medium">{counts.queued}</span>
                    <span className="text-xs text-muted-foreground">Queued</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-sm font-medium">{counts.processing}</span>
                    <span className="text-xs text-muted-foreground">Processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">{counts.completed}</span>
                    <span className="text-xs text-muted-foreground">Completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-sm font-medium">{counts.failed}</span>
                    <span className="text-xs text-muted-foreground">Failed</span>
                  </div>
                </>
              )
            })()}
          </div>
          
          {/* Progress indicator for bulk upload */}
          {isBulkUploading && bulkUploadState.length > 0 && (
            <div className="mt-3 space-y-2">
              <Progress 
                value={
                  (bulkUploadState.filter(item => item.status === 'success').length / bulkUploadState.length) * 100
                } 
                className="h-1.5"
              />
              
              {/* Individual file status - compact view */}
              <div className="max-h-20 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {bulkUploadState.map((item) => (
                    <div key={item.rowId} className="flex items-center gap-1 px-2 py-1 rounded bg-muted/30">
                      <div className="flex items-center">
                        {item.status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-300" />}
                        {item.status === 'uploading' && <Spinner size="sm" />}
                        {item.status === 'success' && <CheckCircle className="w-2 h-2 text-green-500" />}
                        {item.status === 'error' && <XCircle className="w-2 h-2 text-red-500" />}
                      </div>
                      <span className="truncate text-muted-foreground">{item.filename}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Model Library</div>
              <div className="text-xs text-muted-foreground">Upload once, then drag assets onto targets or references.</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={libraryFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (event) => {
                  const files = Array.from(event.target.files || [])
                  if (!files.length) return
                  await handleLibraryUpload(files)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => libraryFileInputRef.current?.click()}
                disabled={isLibraryUploading}
                className="h-8 px-3 text-xs"
              >
                {isLibraryUploading ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span>Uploading…</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Upload className="h-3 w-3" />
                    <span>Upload</span>
                  </div>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => refreshLibrary()}
                disabled={isLibraryLoading}
                aria-label="Refresh library"
              >
                {isLibraryLoading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${isLibraryDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50'}`}
            onDragOver={handleLibraryAreaDragOver}
            onDragLeave={handleLibraryAreaDragLeave}
            onDrop={handleLibraryDrop}
          >
            {isLibraryUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="sm" />
                <span className="font-medium">Uploading…</span>
              </div>
            ) : (
              <div>
                <div className="font-medium text-muted-foreground">Drag images here</div>
                <div>or use the upload button</div>
              </div>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {isLibraryLoading && !libraryAssets.length ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Spinner size="sm" />
                <span>Loading library…</span>
              </div>
            ) : libraryAssets.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {libraryAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`group relative rounded-2xl border border-muted-foreground/10 bg-background/60 p-2 transition-colors ${activeLibraryDragId === asset.id ? 'ring-2 ring-primary' : 'hover:border-muted-foreground/40'}`}
                  >
                    <Thumb
                      src={librarySignedUrls[asset.object_path]}
                      alt={asset.label || 'Library asset'}
                      size={96}
                      className="cursor-grab"
                      dataImagePath={asset.object_path}
                      draggable
                      onDragStart={(event) => {
                        setActiveLibraryDragId(asset.id)
                        event.dataTransfer.effectAllowed = 'copy'
                        event.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify({
                          assetId: asset.id,
                          bucket: asset.bucket,
                          objectPath: asset.object_path,
                          label: asset.label ?? null
                        }))
                        event.dataTransfer.setData('text/plain', asset.object_path)
                      }}
                      onDragEnd={() => setActiveLibraryDragId(null)}
                      ariaGrabbed={activeLibraryDragId === asset.id}
                    />
                    <div className="mt-2 truncate text-center text-[10px] text-muted-foreground">
                      {asset.label || asset.object_path.split('/').pop()}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1 h-7 w-7 rounded-full bg-background/80 opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground focus:opacity-100 group-hover:opacity-100"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleDeleteLibraryAsset(asset)
                      }}
                      aria-label="Delete library asset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No library assets yet. Upload images to reuse across rows.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dimension Controls */}
      <DimensionControls
        model={currentModel} 
        onUpdate={(updatedModel) => {
          setCurrentModel(updatedModel)
          console.log('Model dimensions updated:', updatedModel)
        }} 
      />

      {/* Add Row Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Generation Rows</h2>
        <Button onClick={handleAddRow} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Row
        </Button>
      </div>

      {/* Rows Table */}
      <Card className={`transition-all duration-200 ${
        isGlobalDragActive ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''
      }`}>
        <CardContent className="p-0">
          <div 
            className="overflow-x-auto"
            onDragOver={handleTableDragOver}
            onDragLeave={handleTableDragLeave}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 align-top">Ref</TableHead>
                  <TableHead className="w-24 align-top">
                    <div className="flex flex-col gap-1">
                      <span>Target</span>
                      {isGlobalDragActive && (
                        <span className="text-xs text-primary font-medium">
                          Drop on target area
                        </span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-[16rem] md:w-[18rem] lg:w-[20rem] xl:w-[22rem] shrink-0 align-top">Prompt</TableHead>
                  
                  <TableHead className="w-28 align-top">Generate</TableHead>
                  <TableHead className="w-20 align-top">Status</TableHead>
                  <TableHead className="w-full align-top">
                    <div className="flex items-center justify-between w-full">
                      <span className={`flex-shrink-0 ${isSelectionMode ? 'text-blue-600 font-medium' : ''}`}>
                        {isSelectionMode ? 'Select Images' : 'Results'}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isSelectionMode ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsSelectionMode(true)
                              setSelectedImageIds(new Set())
                            }}
                            className="h-6 px-2 text-xs whitespace-nowrap"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Select
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Checkbox
                                checked={selectedImageIds.size > 0}
                                onCheckedChange={handleSelectAll}
                                className="h-3 w-3"
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {selectedImageIds.size > 0 ? `${selectedImageIds.size} selected` : 'Select All'}
                              </span>
                            </div>
                            {selectedImageIds.size > 0 && (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={handleDownloadSelected}
                                  disabled={isDownloading || isDeleting}
                                  className="h-6 px-2 text-xs whitespace-nowrap"
                                >
                                  {isDownloading ? (
                                    <>
                                      <Spinner size="sm" />
                                      <span className="ml-1">Downloading...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteDialogOpen(true)}
                                  disabled={isDownloading || isDeleting}
                                  className="h-6 px-2 text-xs whitespace-nowrap"
                                >
                                  {isDeleting ? (
                                    <>
                                      <Spinner size="sm" />
                                      <span className="ml-1">Deleting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="w-3 h-3 mr-1" />
                                      Delete
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsSelectionMode(false)
                                setSelectedImageIds(new Set())
                              }}
                              className="h-6 px-2 text-xs whitespace-nowrap"
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </TableHead>
                  <TableHead className="w-16 align-top">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => {
                  // Handle skeleton rows with loading state
                  if ((row as any).isSkeleton) {
                    return (
                      <TableRow key={row.id} className="opacity-60">
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4"></div>
                            <div className="h-2 bg-gray-200 rounded animate-pulse w-full"></div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3"></div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <Spinner size="sm" />
                            <span className="text-sm text-muted-foreground">Creating...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  }

                  const rowState = getRowState(row.id)
                  const images = (row as any).generated_images || []
                  const displayStatus = getLiveStatusForRow(row.id, row.status)
                  const displayProgress = statusToProgress(displayStatus)
                  const live = Object.values(pollingState).find(s => s.rowId === row.id && s.polling)
                  
                  
                  return (
                    <TableRow key={row.id} aria-busy={isActiveStatus(displayStatus)}>
                      {/* 1. Reference Image */}
                      <TableCell className="align-top">
                        <div
                          className={`space-y-2 rounded-xl border border-transparent p-2 transition-colors ${
                            dragOverRefRowId === row.id ? 'border-primary bg-primary/10 shadow-sm' : ''
                          }`}
                          onDragOver={(event) => handleRefDragOver(event, row.id)}
                          onDragLeave={(event) => handleRefDragLeave(event, row.id)}
                          onDrop={(event) => handleRefDrop(event, row.id)}
                        >
                          {/* Display reference images */}
                          <div className="flex flex-wrap gap-2">
                            {row.ref_image_urls && row.ref_image_urls.length > 0 ? (
                              row.ref_image_urls.map((refUrl, index) => (
                                <Dialog key={index}>
                                  <div className="relative group">
                                    <DialogTrigger asChild>
                                      <div className="cursor-zoom-in">
                                        <Thumb
                                          src={rowState.signedUrls[refUrl]}
                                          alt={`Reference image ${index + 1}`}
                                          size={64}
                                          dataImagePath={refUrl}
                                          dataRowId={row.id}
                                          className="transition-transform group-hover:scale-[1.02]"
                                        />
                                      </div>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl">
                                      <DialogHeader>
                                        <DialogTitle>Reference Image {index + 1}</DialogTitle>
                                      </DialogHeader>
                                      <div className="flex justify-center">
                                        <Image
                                          src={rowState.signedUrls[refUrl] || ''}
                                          alt={`Reference image ${index + 1}`}
                                          width={1600}
                                          height={1600}
                                          className="max-w-full max-h-[80vh] object-contain rounded-lg"
                                          loading="lazy"
                                        />
                                      </div>
                                    </DialogContent>
                                  </div>
                                </Dialog>
                              ))
                            ) : (row.ref_image_urls === null || row.ref_image_urls === undefined) && model.default_ref_headshot_url ? (
                              <Dialog>
                                <div className="relative group">
                                  <DialogTrigger asChild>
                                    <div className="cursor-zoom-in">
                                      <Thumb
                                        src={rowState.signedUrls[model.default_ref_headshot_url]}
                                        alt="Default reference image"
                                        size={64}
                                        dataImagePath={model.default_ref_headshot_url}
                                        dataRowId={row.id}
                                        className="transition-transform group-hover:scale-[1.02]"
                                      />
                                    </div>
                                  </DialogTrigger>
                                </div>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Default Reference Image</DialogTitle>
                                  </DialogHeader>
                                  <div className="flex justify-center">
                                    <Image
                                      src={rowState.signedUrls[model.default_ref_headshot_url] || ''}
                                      alt="Default reference image"
                                      width={1600}
                                      height={1600}
                                      className="max-w-full max-h-[80vh] object-contain rounded-lg"
                                      loading="lazy"
                                    />
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                                No ref
                              </div>
                            )}
                          </div>
                          
                          {/* Upload button */}
                          <div className="flex gap-1">
                            <input
                              ref={(el) => { if (el) fileInputRefs.current[`ref-${row.id}`] = el }}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || [])
                                if (files.length === 0) return

                                try {
                                  await handleReferenceImageUpload(row.id, files)
                                } finally {
                                  const input = fileInputRefs.current[`ref-${row.id}`]
                                  if (input) {
                                    input.value = ''
                                  }
                                }
                              }}
                              className="hidden"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fileInputRefs.current[`ref-${row.id}`]?.click()}
                              className="text-xs h-8 px-3 w-auto bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-800 transition-colors duration-200"
                            >
                              <Plus className="w-3 h-3 mr-1.5" />
                              Add Ref
                            </Button>
                            {row.ref_image_urls && row.ref_image_urls.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await fetch(`/api/rows/${row.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ref_image_urls: [] })
                                  })
                                  refreshRowData()
                                }}
                                className="text-xs h-6 px-2 bg-orange-100 hover:bg-orange-200 border-orange-300 text-orange-700 hover:text-orange-800 transition-colors duration-200"
                              >
                                <X className="w-3 h-3 mr-1" />
                                Clear All
                              </Button>
                            )}
                          </div>
                          
                          {/* Remove buttons for reference images */}
                          {((row.ref_image_urls && row.ref_image_urls.length > 0) || (row.ref_image_urls === null || row.ref_image_urls === undefined) && model.default_ref_headshot_url) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {/* Remove buttons for row-specific reference images */}
                              {row.ref_image_urls && row.ref_image_urls.length > 0 && 
                                row.ref_image_urls.map((refUrl, index) => (
                                   <Button
                                     key={`remove-${index}`}
                                     size="sm"
                                     variant="destructive"
                                     onClick={async () => {
                                       const newRefs = row.ref_image_urls?.filter((_, i) => i !== index) || []
                                       await fetch(`/api/rows/${row.id}`, {
                                         method: 'PATCH',
                                         headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({ ref_image_urls: newRefs })
                                       })
                                       refreshRowData()
                                     }}
                                     className="text-xs h-6 px-2 bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600 transition-colors duration-200 shadow-sm"
                                     title={`Remove reference image ${index + 1}`}
                                   >
                                     <X className="w-3 h-3 mr-1" />
                                     Remove {index + 1}
                                   </Button>
                                ))
                              }
                              
                               {/* Remove button for default reference image (only show when ref_image_urls is null/undefined, not when it's explicitly empty []) */}
                               {(row.ref_image_urls === null || row.ref_image_urls === undefined) && model.default_ref_headshot_url && (
                                 <Button
                                   size="sm"
                                   variant="destructive"
                                   onClick={async () => {
                                     // Set ref_image_urls to empty array to disable default ref
                                     await fetch(`/api/rows/${row.id}`, {
                                       method: 'PATCH',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ ref_image_urls: [] })
                                     })
                                     refreshRowData()
                                   }}
                                   className="text-xs px-3 w-auto h-8 flex flex-col items-center justify-center leading-none bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600 transition-colors duration-200 shadow-sm"
                                   title="Remove default reference image"
                                 >
                                   <div className="flex items-center">
                                     <X className="w-3 h-3 mr-1.5" />
                                     Remove
                                   </div>
                                   <div>Default</div>
                                 </Button>
                               )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* 2. Target Image (Enhanced Drag & Drop) */}
                      <TableCell className="align-top">
                        <div
                          className={`relative group transition-all duration-200 ${
                            dragOverRowId === row.id 
                              ? 'scale-105 shadow-lg' 
                              : ''
                          }`}
                          onDragOver={(e) => handleTargetDragOver(e, row.id)}
                          onDragLeave={(e) => handleTargetDragLeave(e, row.id)}
                          onDrop={(e) => handleTargetDrop(e, row.id)}
                        >
                          {row.target_image_url ? (
                            <Dialog>
                              <div className="relative group">
                                <DialogTrigger asChild>
                                  <div className="cursor-zoom-in">
                                    <Thumb
                                      src={rowState.signedUrls[row.target_image_url]}
                                      alt="Target image"
                                      size={88}
                                      dataImagePath={row.target_image_url}
                                      dataRowId={row.id}
                                      className={`transition-all duration-200 ${
                                        dragOverRowId === row.id 
                                          ? 'ring-2 ring-primary ring-offset-2' 
                                          : rowState.isUploadingTarget
                                          ? 'opacity-50'
                                          : 'group-hover:scale-[1.02]'
                                      }`}
                                    />
                                  </div>
                                </DialogTrigger>
                                <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 rounded">
                                  <button
                                    className="text-white text-[10px] px-1 py-0.5 bg-white/20 rounded"
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      await fetch(`/api/rows/${row.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ target_image_url: '' })
                                      })
                                      refreshRowData()
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Target Image</DialogTitle>
                                  </DialogHeader>
                                  <div className="flex justify-center">
                                    <Image
                                      src={rowState.signedUrls[row.target_image_url] || ''}
                                      alt="Target image"
                                      width={1600}
                                      height={1600}
                                      className="max-w-full max-h-[80vh] object-contain rounded-lg"
                                      loading="lazy"
                                    />
                                  </div>
                                </DialogContent>
                              </div>
                            </Dialog>
                          ) : (
                            <div 
                              className={`relative flex h-22 w-22 items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 ${
                                dragOverRowId === row.id
                                  ? 'border-primary bg-primary/10 text-primary scale-105 shadow-lg'
                                  : rowState.isUploadingTarget
                                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                                  : 'border-muted-foreground/25 bg-muted text-muted-foreground hover:border-muted-foreground/50'
                              }`}
                              onClick={() => !rowState.isUploadingTarget && fileInputRefs.current[row.id]?.click()}
                            >
                              {rowState.isUploadingTarget ? (
                                <div className="flex flex-col items-center gap-1">
                                  <Spinner size="sm" />
                                  <span className="text-xs font-medium">Uploading...</span>
                                </div>
                              ) : dragOverRowId === row.id ? (
                                <div className="flex flex-col items-center gap-1">
                                  <Upload className="h-6 w-6 animate-bounce" />
                                  <span className="text-xs font-medium">Drop image</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <Upload className="h-5 w-5" />
                                  <span className="text-xs">Drop or click</span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Drag overlay for existing images */}
                          {row.target_image_url && dragOverRowId === row.id && (
                            <div className="absolute inset-0 bg-primary/20 border-2 border-primary border-dashed rounded-lg flex items-center justify-center z-10">
                              <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                                Drop to replace
                              </div>
                            </div>
                          )}
                          
                          {/* Upload loading overlay for existing images */}
                          {row.target_image_url && rowState.isUploadingTarget && (
                            <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center z-10">
                              <div className="bg-white text-black px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
                                <Spinner size="sm" />
                                Replacing...
                              </div>
                            </div>
                          )}
                          
                          <input
                            ref={(el) => {
                              if (el) fileInputRefs.current[row.id] = el
                            }}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleTargetImageUpload(file, row.id)
                            }}
                            className="hidden"
                          />
                        </div>
                      </TableCell>
                      
                      {/* 3. Prompt Editor */}
                      <TableCell className="align-top">
                        <Dialog>
                          <div className="flex flex-col gap-1">
                            <Textarea
                              value={getCurrentPrompt(row.id)}
                              placeholder="Enter prompt..."
                              className="min-h-[80px] md:min-h-[88px] resize-y bg-muted/60 w-[16rem] md:w-[18rem] lg:w-[20rem] xl:w-[22rem] select-text shrink-0"
                              onChange={(e) => handlePromptChange(row.id, e.target.value)}
                              onBlur={(e) => handlePromptBlur(row.id, e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                  const target = e.target as HTMLTextAreaElement
                                  handlePromptBlur(row.id, target.value)
                                  handleGenerate(row.id)
                                }
                              }}
                            />
                            <div className="flex gap-1">
                              <DialogTrigger asChild>
                                <Button variant="soft" size="sm">Expand</Button>
                              </DialogTrigger>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAiPromptGeneration(row.id)}
                                disabled={rowState.isGeneratingPrompt || !hasValidImages(row)}
                                title="Generate AI prompt from images"
                              >
                                {rowState.isGeneratingPrompt ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <Wand2 className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Edit Prompt</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-2">
                              <Textarea
                                value={getCurrentPrompt(row.id)}
                                className="min-h-[40vh] w-full resize-y"
                                onChange={(e) => handlePromptChange(row.id, e.target.value)}
                                onBlur={(e) => handlePromptBlur(row.id, e.target.value)}
                              />
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                      
                      
                      
                      {/* Generate Button */}
                      <TableCell className="align-top">
                        {(() => {
                          const hasTarget = Boolean(row?.target_image_url)
                          const disabledReason = !hasTarget
                            ? 'Upload a target image first'
                            : ''
                          const isDisabled = !hasTarget || rowState.isGenerating || isActiveStatus(displayStatus)
                          return (
                            <Tooltip open={isDisabled && !!disabledReason ? undefined : false}>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleGenerate(row.id)}
                                  disabled={isDisabled}
                                  size="sm"
                                  aria-busy={rowState.isGenerating || isActiveStatus(displayStatus)}
                                  className="gap-2 transition-opacity duration-200"
                                >
                                  {isActiveStatus(displayStatus) ? (
                                    <>
                                      <Spinner 
                                        key={`spinner-${row.id}-${displayStatus}`}
                                        size="sm"
                                      />
                                      {getStatusLabel(displayStatus)}
                                    </>
                                  ) : rowState.isGenerating ? (
                                    <>
                                      <Spinner 
                                        key={`spinner-${row.id}-generating`}
                                        size="sm"
                                      />
                                      Generating
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="h-4 w-4 transition-transform hover:scale-110" />
                                      Generate
                                    </>
                                  )}
                                </Button>
                              </TooltipTrigger>
                              {disabledReason && (
                                <TooltipContent>{disabledReason}</TooltipContent>
                              )}
                            </Tooltip>
                          )
                        })()}
                        
                        
                        {live?.queuePosition !== undefined && isActiveStatus(displayStatus) && (
                          <div className="mt-1 text-[10px] text-muted-foreground">{live.queuePosition > 0 ? `#${live.queuePosition} in queue` : 'In progress'}</div>
                        )}
                      </TableCell>
                      
                      {/* 6. Status */}
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2 min-w-[6.5rem]" aria-live="polite">
                          <Badge variant={getStatusColor(displayStatus) as any} className="w-fit">
                            <span className="inline-flex items-center gap-2">
                              {isActiveStatus(displayStatus) && (
                                <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse" />
                              )}
                              {getStatusLabel(displayStatus)}
                            </span>
                          </Badge>
                          <Progress value={displayProgress} className="h-1.5" />
                        </div>
                      </TableCell>
                      
                      {/* 7. Results (Horizontal Single Row Scroll) */}
                      <TableCell className="align-top">
                        <div className="flex flex-nowrap gap-2 pb-2 h-[112px] overflow-x-auto overflow-y-hidden overscroll-x-contain -mx-1 px-1 snap-x snap-mandatory">
                          {images.length > 0 ? (
                            images.map((image: GeneratedImage, index: number) => (
                              <div key={image.id} className="relative group">
                                {!isSelectionMode ? (
                                  <div 
                                    className="relative cursor-zoom-in"
                                    onClick={() => setDialogState({ isOpen: true, rowId: row.id, imageIndex: index })}
                                  >
                                    <Thumb
                                      src={rowState.signedUrls[image.output_url]}
                                      alt="Generated image"
                                      size={96}
                                      className="flex-shrink-0 snap-start"
                                      dataImagePath={image.output_url}
                                      dataRowId={row.id}
                                    />
                                    {/* Favorite button overlay - always visible in top-left */}
                                    {(() => {
                                      const isFavorited = favoritesState[image.id] ?? (image.is_favorited === true)
                                      
                                      return (
                                        <button
                                          key={`star-${image.id}-${isFavorited}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleToggleFavorite(image.id, isFavorited)
                                          }}
                                          className={`absolute top-1 left-1 p-1.5 rounded-full transition-all duration-200 z-20 ${
                                            isFavorited
                                              ? 'bg-transparent hover:bg-black/20'
                                              : 'bg-transparent hover:bg-black/20'
                                          }`}
                                          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                                          style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 20 }}
                                        >
                                          {isFavorited ? (
                                            // Favorited state - filled yellow star
                                            <div className="w-4 h-4 flex items-center justify-center relative">
                                              <Star className="w-4 h-4 text-yellow-400" style={{ fill: 'currentColor' }} />
                                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></div>
                                            </div>
                                          ) : (
                                            // Not favorited state - outline white star
                                            <Star className="w-4 h-4 text-white hover:text-yellow-300" />
                                          )}
                                        </button>
                                      )
                                    })()}
                                  </div>
                                ) : (
                                  <div 
                                    className={`relative cursor-pointer transition-all duration-200 ${
                                      selectedImageIds.has(image.id) 
                                        ? 'ring-2 ring-blue-500 ring-offset-2' 
                                        : 'hover:ring-1 hover:ring-gray-300'
                                    }`} 
                                    onClick={() => handleToggleImageSelection(image.id)}
                                  >
                                    <Thumb
                                      src={rowState.signedUrls[image.output_url]}
                                      alt="Generated image"
                                      size={96}
                                      className={`flex-shrink-0 snap-start transition-opacity duration-200 ${
                                        selectedImageIds.has(image.id) ? 'opacity-80' : ''
                                      }`}
                                      dataImagePath={image.output_url}
                                      dataRowId={row.id}
                                    />
                                    {/* Favorite button overlay - always visible in top-left */}
                                    {(() => {
                                      const isFavorited = favoritesState[image.id] ?? (image.is_favorited === true)
                                      
                                      return (
                                        <button
                                          key={`star-${image.id}-${isFavorited}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleToggleFavorite(image.id, isFavorited)
                                          }}
                                          className={`absolute top-1 left-1 p-1.5 rounded-full transition-all duration-200 z-20 ${
                                            isFavorited
                                              ? 'bg-transparent hover:bg-black/20'
                                              : 'bg-transparent hover:bg-black/20'
                                          }`}
                                          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                                          style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 20 }}
                                        >
                                          {isFavorited ? (
                                            // Favorited state - filled yellow star
                                            <div className="w-4 h-4 flex items-center justify-center relative">
                                              <Star className="w-4 h-4 text-yellow-400" style={{ fill: 'currentColor' }} />
                                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></div>
                                            </div>
                                          ) : (
                                            // Not favorited state - outline white star
                                            <Star className="w-4 h-4 text-white hover:text-yellow-300" />
                                          )}
                                        </button>
                                      )
                                    })()}
                                    {/* Selection checkbox overlay - in bottom-right when in selection mode */}
                                    {isSelectionMode && (
                                      <div 
                                        className="absolute bottom-1 right-1 z-20"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          e.preventDefault()
                                          handleToggleImageSelection(image.id)
                                        }}
                                        style={{ position: 'absolute', bottom: '4px', right: '4px', zIndex: 20 }}
                                      >
                                        <div className="p-1 rounded-full bg-transparent">
                                          <Checkbox
                                            checked={selectedImageIds.has(image.id)}
                                            onCheckedChange={(checked) => {
                                              handleToggleImageSelection(image.id)
                                            }}
                                            className="h-4 w-4"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              e.preventDefault()
                                            }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (isActiveStatus(displayStatus) || rowState.isLoadingResults) ? (
                            <div className="flex items-center gap-3">
                              <div className="h-[72px] w-[72px] rounded-xl bg-muted animate-pulse" />
                              <div className="h-[72px] w-[72px] rounded-xl bg-muted animate-pulse" />
                              {rowState.isLoadingResults && (
                                <span className="text-xs text-muted-foreground">Loading images…</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-14 px-4 text-xs text-muted-foreground">
                              No images yet
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* 8. Actions */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRow(row.id)}
                        >
                          <X className="h-4 w-4" />
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

      {rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No rows yet. Add your first row to start generating images.</p>
            <Button onClick={handleAddRow}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Row
            </Button>
          </CardContent>
        </Card>
      )}

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
            
            const images = (currentRow as any).generated_images || []
            const rowState = rowStates[dialogState.rowId]
            
            if (!rowState || images.length === 0) return null
            
            const currentImage = images[dialogState.imageIndex]
            if (!currentImage) return null
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Generated Image {dialogState.imageIndex + 1} of {images.length}
                  </DialogTitle>
                </DialogHeader>
                
                {/* Favorites button - top-left overlay */}
                <button 
                  onClick={() => handleToggleFavorite(currentImage.id, getCurrentFavoriteStatus(currentImage.id, currentImage.is_favorited))}
                  className="absolute top-4 left-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  title={getCurrentFavoriteStatus(currentImage.id, currentImage.is_favorited) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star 
                    className={`w-5 h-5 ${getCurrentFavoriteStatus(currentImage.id, currentImage.is_favorited) ? 'fill-yellow-400 text-yellow-400' : 'text-white hover:text-yellow-300'}`} 
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
                    <Image
                      src={rowState.signedUrls[currentImage.output_url] || ''}
                      alt="Generated image"
                      width={1920}
                      height={1920}
                      className="max-w-full max-h-[80vh] object-contain rounded-lg"
                      loading="lazy"
                    />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Images</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete {selectedImageIds.size} selected image{selectedImageIds.size === 1 ? '' : 's'}? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
