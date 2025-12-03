'use client'

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
import { Wand2, Sparkles, Copy, Trash2, Plus, X, AlertCircle, Play, Eye, EyeOff, ChevronDown, ChevronUp, Star, ChevronLeft, ChevronRight, ImageIcon, Folder, Upload, Archive, CheckCircle, XCircle, Info, Download, Check, TrendingUp, RefreshCw } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { uploadImage, validateFile } from '@/lib/client-upload'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAvailableModels, getWaveSpeedModel, DEFAULT_MODEL_ID } from '@/lib/wavespeed-models'
import { DEBOUNCE_TIMES } from '@/lib/debounce'

interface VariantsRowsWorkspaceProps {
  initialRows: VariantRow[]
  modelId?: string
  onRowsChange?: (rows: VariantRow[]) => void
  onAddRow?: (addRow: (row: VariantRow) => void) => void
}

const INTERNAL_IMAGE_MIME = 'application/x-ai-studio-image'

// Auto-scroll constants for drag and drop
const SCROLL_THRESHOLD = 100 // pixels from edge
const MAX_SCROLL_SPEED = 20 // pixels per frame
const MIN_SCROLL_SPEED = 5

// Preset enhancement chips for quick access - organized by category
const PRESET_ENHANCEMENTS = {
  quality: [
    { label: '✨ Professional studio', value: 'Apply professional studio quality with even lighting distribution' },
    { label: '📸 Casual snapshot', value: 'Make casual snapshot with balanced exposure and even ambient lighting' },
    { label: '🎥 Film grain', value: 'Add film grain texture with reduced sharpness' },
    { label: '📱 iPhone selfie', value: 'Apply iPhone front camera selfie with balanced exposure' }
  ],
  lighting: [
    // Quality improvements (with balanced exposure)
    { label: '🔥 Dramatic lighting', value: 'Apply dramatic lighting with balanced exposure' },
    { label: '🌅 Golden hour', value: 'Add golden hour lighting with warm color temperature and balanced exposure' },
    { label: '🌙 Low-key lighting', value: 'Apply low-key lighting with balanced exposure' },
    { label: '🎭 Rembrandt lighting', value: 'Apply Rembrandt lighting with balanced exposure' },
    { label: '🪟 Natural window light', value: 'Change to natural window lighting with balanced exposure' },
    // Degradation lighting (no balanced exposure)
    { label: '💡 Flat overhead', value: 'Change to flat overhead ceiling light, slightly underexposed, no studio lighting, keeping everything else the exact same' },
    { label: '🌓 Mixed color temps', value: 'Apply mixed warm indoor lights and cool daylight from window, auto-exposure struggling, shadows under eyes, keeping everything else the exact same' },
    { label: '💡 Harsh fluorescent', value: 'Change to harsh overhead fluorescent light, slight green cast, no professional lighting, keeping everything else the exact same' },
    { label: '🟠 Streetlight orange', value: 'Apply orange streetlight glow, uneven lighting across face, some areas in shadow, visible noise, keeping everything else the exact same' },
    { label: '☀️ Backlit window', value: 'Apply strong backlight from window, subject slightly underexposed, details in face slightly muddy, background mildly blown out, keeping everything else the exact same' },
    { label: '🎉 Mixed neon bar', value: 'Apply mixed neon and warm lighting, slight colour shift on skin, grainy dark corners, no clean studio edges, keeping everything else the exact same' }
  ],
  degradation: [
    { label: '📱 Dull room light', value: 'Turn this into a shot on an older iPhone in a small bedroom: flat overhead ceiling light, slightly underexposed, soft focus with hint of motion blur, faint grain and phone camera noise, no studio lighting, no depth-of-field effect, looks like an everyday unedited phone snapshot, keeping everything else the exact same' },
    { label: '🌓 Auto-exposure struggling', value: 'Turn this into a casual iPhone photo: auto-exposure struggling with mixed warm indoor lights and cool daylight from window, shadows under eyes, slight overexposure on skin highlights, subtle digital noise, no professional lighting, looks like a quick photo a friend took, not a photoshoot, keeping everything else the exact same' },
    { label: '🤳 Front camera selfie', value: 'Turn this into a shot captured with an iPhone front camera: arm\'s-length distance, slightly distorted wide-angle perspective, soft detail on skin, mild smoothing from phone processing, tiny bit of motion blur, default camera app look, no studio sharpness or cinematic feel, keeping everything else the exact same' },
    { label: '📸 ISO noise + compression', value: 'Turn this into a realistic smartphone photo at high ISO: visible fine grain in darker areas, touch of colour noise, slightly muddy shadows, gentle JPEG compression artifacts around edges, ordinary 12-megapixel phone resolution, not ultra-sharp or 4K, keeping everything else the exact same' },
    { label: '📷 Accidental pocket shot', value: 'Turn this into an unremarkable iPhone snapshot: awkward framing, subject slightly off-center, touch of motion blur from moving phone, mildly blown highlights on brightest areas, everyday camera-roll quality, looks like it was taken quickly without careful setup, keeping everything else the exact same' },
    { label: '🌙 Dim bedroom at night', value: 'Turn this into a low-light iPhone photo in a dim bedroom: only bedside lamp on, soft yellow light, visible noise in background, slightly soft details, no dramatic contrast, realistic handheld phone shot at night, no pro lighting, keeping everything else the exact same' },
    { label: '🪞 Grainy changing-room mirror', value: 'Turn this into an iPhone mirror selfie in a clothing changing room: harsh overhead fluorescent light, slight green cast, grainy midtones, soft edges around model, mirror smudges faintly visible, looks like a quick try-on photo for friends, keeping everything else the exact same' },
    { label: '🟠 Streetlight glow', value: 'Turn this into a casual night-time iPhone photo under orange streetlights: uneven lighting across face, some areas in shadow, slight motion blur from slow shutter, visible noise in sky and background, looks like a real late-night phone snap, not a polished night portrait mode, keeping everything else the exact same' },
    { label: '☀️ Backlit and muddy', value: 'Turn this into a realistic smartphone shot with strong backlight from window: subject a little underexposed, details in face slightly muddy, background mildly blown out, subtle lens flare streaks, overall soft contrast, like a quick phone pic taken against the light, keeping everything else the exact same' },
    { label: '🎉 Club bar lighting', value: 'Turn this into a handheld iPhone photo in a bar: mixed neon and warm lighting, slight colour shift on skin, grainy dark corners, small motion blur from dancing or moving, no clean studio edges, looks like a social photo from a night out, keeping everything else the exact same' },
    { label: '📸 Average camera-roll', value: 'Turn this into a simple vertical iPhone portrait: everyday camera-roll quality, medium sharpness but not hyper-detailed, slightly crooked horizon, cluttered background still in focus, no bokeh, no cinematic look, feels like a casual friend photo rather than a photoshoot, keeping everything else the exact same' },
    { label: '🔍 Over-sharpened phone', value: 'Turn this into a standard iPhone camera processing: light over-sharpening on edges, slight halo around hair and clothing, textures not ultra-fine, small amount of HDR look in sky and shadows, typical modern phone photo rather than professional lens rendering, keeping everything else the exact same' },
    { label: '👓 Slightly dirty lens', value: 'Turn this into a realistic smartphone photo taken with slightly smudged lens: very subtle hazy glow over bright areas, reduced micro-contrast, softer detail around highlights, no crisp studio lighting, gives impression of a real, imperfect phone camera, keeping everything else the exact same' },
    { label: '🚶 Quick hallway snap', value: 'Turn this into a quick iPhone hallway snapshot: subject mid-step, little motion blur in hands or legs, uneven indoor lighting, background objects in full focus, mild noise, overall feel of an unplanned photo rather than a staged shoot, keeping everything else the exact same' },
    { label: '💬 Sent to a mate', value: 'Turn this into a low-effort iPhone photo: casual pose, slightly awkward crop cutting off parts of body, plain indoor lighting with no dramatic shadows, moderate grain, normal phone dynamic range with some clipped whites and crushed blacks, looks like something sent over WhatsApp, not an advert, keeping everything else the exact same' }
  ],
  composition: [
    { label: '📷 Casual snap', value: 'Turn this into a casual snapshot: candid composition with off-center framing, handheld phone camera perspective, flat indoor lighting, avoiding studio polish, keeping everything else the exact same' },
    { label: '🎯 Off-center framing', value: 'Apply off-center composition with subject positioned using rule of thirds, asymmetric framing, informal camera placement, keeping everything else the exact same' },
    { label: '👄 Bottom half face', value: 'Apply close-up crop showing only bottom half of face (mouth and chin visible), maintaining exact framing, keeping everything else the exact same' },
    { label: '👁️ Top half face', value: 'Apply close-up crop showing only top half of face (eyes and forehead visible), maintaining exact framing, keeping everything else the exact same' },
    { label: '⬅️ Left side crop', value: 'Apply side crop showing left side of face, maintaining exact framing, keeping everything else the exact same' },
    { label: '➡️ Right side crop', value: 'Apply side crop showing right side of face, maintaining exact framing, keeping everything else the exact same' },
    { label: '🔍 Close-up tight crop', value: 'Apply very tight close-up crop with minimal framing, maintaining exact composition, keeping everything else the exact same' }
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
  ],
  modifications: [
    { label: '💍 Remove all jewelry', value: 'Remove all jewelry including necklaces, earrings, rings, bracelets, and watches, keeping everything else the exact same' },
    { label: '📿 Remove necklaces', value: 'Remove necklaces and neck jewelry, keeping everything else the exact same' },
    { label: '💎 Remove earrings', value: 'Remove earrings, keeping everything else the exact same' },
    { label: '💍 Remove rings', value: 'Remove rings, keeping everything else the exact same' },
    { label: '⌚ Remove bracelets/watches', value: 'Remove bracelets and watches, keeping everything else the exact same' }
  ],
  clothing: [
    { label: '🔴 Red clothing', value: 'Change clothing color to red, keeping everything else the exact same' },
    { label: '🔵 Blue clothing', value: 'Change clothing color to blue, keeping everything else the exact same' },
    { label: '🟢 Green clothing', value: 'Change clothing color to green, keeping everything else the exact same' },
    { label: '⚫ Black clothing', value: 'Change clothing color to black, keeping everything else the exact same' },
    { label: '⚪ White clothing', value: 'Change clothing color to white, keeping everything else the exact same' },
    { label: '🩷 Pink clothing', value: 'Change clothing color to pink, keeping everything else the exact same' },
    { label: '🟡 Yellow clothing', value: 'Change clothing color to yellow, keeping everything else the exact same' },
    { label: '🟣 Purple clothing', value: 'Change clothing color to purple, keeping everything else the exact same' },
    { label: '🟠 Orange clothing', value: 'Change clothing color to orange, keeping everything else the exact same' },
    { label: '⚪ Gray clothing', value: 'Change clothing color to gray, keeping everything else the exact same' },
    { label: '🔵 Navy clothing', value: 'Change clothing color to navy, keeping everything else the exact same' },
    { label: '🔴 Burgundy clothing', value: 'Change clothing color to burgundy, keeping everything else the exact same' },
    { label: '🔵 Teal clothing', value: 'Change clothing color to teal, keeping everything else the exact same' },
    { label: '🩷 Coral clothing', value: 'Change clothing color to coral, keeping everything else the exact same' },
    { label: '🟤 Beige clothing', value: 'Change clothing color to beige, keeping everything else the exact same' },
    { label: '🔴 Maroon clothing', value: 'Change clothing color to maroon, keeping everything else the exact same' },
    { label: '🟢 Emerald clothing', value: 'Change clothing color to emerald, keeping everything else the exact same' },
    { label: '🔴 Crimson clothing', value: 'Change clothing color to crimson, keeping everything else the exact same' },
    { label: '🟡 Gold clothing', value: 'Change clothing color to gold, keeping everything else the exact same' },
    { label: '⚪ Silver clothing', value: 'Change clothing color to silver, keeping everything else the exact same' }
  ]
}

export function VariantsRowsWorkspace({ initialRows, modelId, onRowsChange, onAddRow }: VariantsRowsWorkspaceProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  
  // Prompt state management (aligned with model-workspace pattern) - MUST be declared before useEffects that use them
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({})
  const [dirtyPrompts, setDirtyPrompts] = useState<Set<string>>(new Set())
  const [savingPrompts, setSavingPrompts] = useState<Set<string>>(new Set())
  const dirtyPromptsRef = useRef<Set<string>>(new Set())
  const savingPromptsRef = useRef<Set<string>>(new Set())
  
  // Keep rowsRef in sync with rows state (for realtime handlers to access current state)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  
  // Keep refs in sync with state for prompt management
  useEffect(() => {
    dirtyPromptsRef.current = dirtyPrompts
  }, [dirtyPrompts])
  
  useEffect(() => {
    savingPromptsRef.current = savingPrompts
  }, [savingPrompts])
  
  // Initialize local prompts from row data (preserve dirty prompts)
  useEffect(() => {
    const initialPrompts: Record<string, string> = {}
    rows.forEach(row => {
      // Only initialize if this prompt is not dirty (preserve unsaved edits)
      if (!dirtyPrompts.has(row.id) && !savingPrompts.has(row.id)) {
        const promptValue = row.prompt || ''
        initialPrompts[row.id] = promptValue
      }
    })
    // Merge only non-dirty prompts, preserving dirty ones
    setLocalPrompts(prev => {
      const merged = { ...prev }
      Object.keys(initialPrompts).forEach(rowId => {
        // Only update if not dirty and not currently saving
        if (!dirtyPrompts.has(rowId) && !savingPrompts.has(rowId)) {
          merged[rowId] = initialPrompts[rowId]
        }
      })
      return merged
    })
  }, [rows, dirtyPrompts, savingPrompts])
  
  // Initialize refs on mount
  useEffect(() => {
    rowsRef.current = initialRows
    prevRowsRef.current = initialRows
  }, []) // Only run once on mount
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [generatingPromptRowId, setGeneratingPromptRowId] = useState<string | null>(null)
  const [enhancingRowId, setEnhancingRowId] = useState<string | null>(null)
  const [improvingRowId, setImprovingRowId] = useState<string | null>(null)
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
  
  const loadingImagesRef = useRef<Set<string>>(new Set())
  const refreshTimeout = useRef<number | null>(null)
  const prevRowsRef = useRef<VariantRow[]>(initialRows)
  const isInitialMount = useRef(true)
  const deletedRowIdsRef = useRef<Set<string>>(new Set())
  // Track recently added rows to prevent sync logic from removing them before router.refresh() completes
  const recentlyAddedRowIdsRef = useRef<Set<string>>(new Set())
  // Store timeout IDs for recently added rows cleanup
  const recentlyAddedTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  // Ref to access current rows state without closure dependency
  const rowsRef = useRef<VariantRow[]>(initialRows)
  const lastRefreshTimeRef = useRef<number>(0)
  const isRefreshingRef = useRef<boolean>(false)
  // Store jobId -> rowId mapping to avoid closure issues in polling callback
  const jobIdToRowIdRef = useRef<Record<string, string>>({})
  // Track jobs that are currently being processed to prevent duplicate refresh attempts
  const processingJobsRef = useRef<Set<string>>(new Set())
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
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null)
  const [draggedImageSourceRowId, setDraggedImageSourceRowId] = useState<string | null>(null)
  const zipFileInputRef = useRef<HTMLInputElement>(null)
  // Auto-scroll state for drag and drop
  const scrollAnimationFrameRef = useRef<number | null>(null)
  const isAutoScrollingRef = useRef<boolean>(false)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null)
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false)
  // Bulk prompt generation state
  const [isBulkGeneratingPrompts, setIsBulkGeneratingPrompts] = useState(false)
  const [bulkPromptProgress, setBulkPromptProgress] = useState<{ total: number; completed: number; failed: number }>({ total: 0, completed: 0, failed: 0 })
  const [bulkPromptStatus, setBulkPromptStatus] = useState<Record<string, 'pending' | 'processing' | 'success' | 'error'>>({})
  const bulkPromptCancelRef = useRef<boolean>(false)
  // Bulk selection state
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  
  // Sync initialRows prop changes to local state (aligns with rows tab pattern)
  // This ensures data stays fresh when parent re-renders with new data
  // BUT: Don't overwrite local deletions - if we've deleted a row locally, don't bring it back
  // FIXED: Removed 'rows' from dependency array to prevent circular updates
  // Use functional setState to access current rows value without dependency
  useEffect(() => {
    // Skip if this is the initial mount (handled separately)
    if (isInitialMount.current) {
      return
    }
    
    // Use functional setState to get current rows without dependency
    setRows(prev => {
      // Only update if initialRows actually changed (by comparing IDs)
      const currentIds = new Set(prev.map(r => r.id))
      const newIds = new Set(initialRows.map(r => r.id))
      
      // Check if there are new rows in initialRows that aren't in current state
      const newRowIds = Array.from(newIds).filter(id => !currentIds.has(id))
      
      // Check if there are rows in current state that aren't in initialRows
      // BUT exclude rows we've explicitly deleted (they should stay deleted)
      // AND exclude recently added rows (they haven't been synced from server yet)
      const removedRowIds = Array.from(currentIds).filter(id => {
        if (!newIds.has(id)) {
          // This row is in current state but not in initialRows
          // Only treat as "removed" if we didn't explicitly delete it AND it's not recently added
          return !deletedRowIdsRef.current.has(id) && !recentlyAddedRowIdsRef.current.has(id)
        }
        return false
      })
      
      // Only sync if there are genuinely new rows to add, or if initialRows has fewer rows
      // AND we haven't explicitly deleted those rows
      const hasNewRows = newRowIds.length > 0
      const hasRemovedRows = removedRowIds.length > 0 && removedRowIds.some(id => !deletedRowIdsRef.current.has(id))
      
      // If no changes needed, return previous state
      if (!hasNewRows && !hasRemovedRows) {
        return prev
      }
      
      // If initialRows has new rows that we don't have, merge them in
      if (hasNewRows) {
        console.log('[Variants] Syncing new rows from initialRows', {
          newRowIds,
          currentCount: prev.length,
          newCount: initialRows.length
        })
        
        // Merge: keep existing rows, add new ones from initialRows
        const existingRowMap = new Map(prev.map(r => [r.id, r]))
        const newRowsFromInitial = initialRows.filter(r => !existingRowMap.has(r.id) && !deletedRowIdsRef.current.has(r.id))
        
        if (newRowsFromInitial.length > 0) {
          return [...prev, ...newRowsFromInitial]
        }
      }
      
      // If initialRows is missing rows that we have (and we didn't delete them), 
      // it means they were deleted elsewhere - remove them
      if (hasRemovedRows) {
        const rowsToRemove = removedRowIds.filter(id => !deletedRowIdsRef.current.has(id))
        console.log('[Variants] Removing rows that are missing from initialRows', {
          removedRowIds: rowsToRemove
        })
        return prev.filter(r => newIds.has(r.id) || deletedRowIdsRef.current.has(r.id))
      }
      
      return prev
    })
    
    // Clean up deletedRowIdsRef: if a row is no longer in initialRows and we deleted it,
    // we can remove it from the deleted set (it's been confirmed deleted)
    const newIds = new Set(initialRows.map(r => r.id))
    const confirmedDeletedIds = Array.from(deletedRowIdsRef.current).filter(id => !newIds.has(id))
    if (confirmedDeletedIds.length > 0) {
      confirmedDeletedIds.forEach(id => deletedRowIdsRef.current.delete(id))
    }
  }, [initialRows]) // FIXED: Removed 'rows' from dependencies to prevent circular updates
  
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
  
  // Cleanup on unmount (no longer needed for saveTimeoutRef, but keeping for future cleanup)
  useEffect(() => {
    return () => {
      // Cleanup refs
      dirtyPromptsRef.current = new Set()
      savingPromptsRef.current = new Set()
    }
  }, [])
  
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
  // Returns true if images were found, false otherwise
  const refreshSingleRow = useCallback(async (rowId: string, retries = 0): Promise<boolean> => {
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
      
      if (!res.ok) {
        if (retries > 0) {
          // Retry on failure with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)))
          return refreshSingleRow(rowId, retries - 1)
        }
        return false
      }
      
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
      
      // Check if generated images exist
      const generatedImages = normalizedRow.variant_row_images.filter(
        (img: any) => img.is_generated === true
      )
      const hasGeneratedImages = generatedImages.length > 0
      
      // Update the specific row in state using functional setState to ensure proper merge
      // If row doesn't exist, add it (for new rows created elsewhere)
      setRows(prev => {
        const existingIndex = prev.findIndex(r => r.id === rowId)
        if (existingIndex >= 0) {
          // Row exists, update it
          const updated = prev.map(r => {
            if (r.id === rowId) {
              // Merge: preserve any local state but update with fresh data
              return normalizedRow
            }
            return r
          })
          return updated
        } else {
          // Row doesn't exist, add it at the beginning (newest first)
          // Filter by modelId if provided to ensure we only add relevant rows
          if (modelId && normalizedRow.model_id !== modelId) {
            return prev // Don't add if modelId doesn't match
          }
          return [normalizedRow, ...prev]
        }
      })
      
      return hasGeneratedImages
    } catch (e) {
      console.error('Failed to refresh single row:', e)
      if (retries > 0) {
        // Retry on error with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)))
        return refreshSingleRow(rowId, retries - 1)
      }
      return false
    }
  }, [modelId])

  // Fetch multiple rows by ID and add them to state immediately
  // Used for optimistic updates when rows are added via events
  const refreshRowsByIds = useCallback(async (rowIds: string[]): Promise<void> => {
    if (rowIds.length === 0) return

    try {
      console.log('[Variants] Fetching rows by IDs for immediate update', {
        rowIds,
        count: rowIds.length
      })

      // Fetch all rows in parallel
      const fetchPromises = rowIds.map(async (rowId) => {
        try {
          const url = new URL(`/api/variants/rows/${rowId}`, window.location.origin)
          url.searchParams.set('_t', Date.now().toString())
          
          const res = await fetch(url.toString(), { 
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache'
            }
          })
          
          if (!res.ok) {
            console.warn('[Variants] Failed to fetch row', { rowId, status: res.status })
            return null
          }
          
          const { row } = await res.json()
          
          // Normalize images: ensure is_generated is explicitly boolean
          const normalizedRow: VariantRow = {
            ...row,
            variant_row_images: (row.variant_row_images || []).map((img: any) => ({
              ...img,
              is_generated: img.is_generated === true
            }))
          }
          
          return normalizedRow
        } catch (error) {
          console.error('[Variants] Error fetching row', { rowId, error })
          return null
        }
      })

      const fetchedRows = await Promise.all(fetchPromises)
      const validRows = fetchedRows.filter((row): row is VariantRow => row !== null)

      if (validRows.length === 0) {
        console.warn('[Variants] No valid rows fetched', { rowIds })
        return
      }

      console.log('[Variants] Successfully fetched rows for immediate update', {
        requested: rowIds.length,
        fetched: validRows.length
      })

      // Add new rows to state immediately (optimistic update)
      setRows(prev => {
        const existingIds = new Set(prev.map(r => r.id))
        const newRows = validRows.filter(r => !existingIds.has(r.id))
        
        if (newRows.length === 0) {
          // All rows already exist, just update them
          return prev.map(prevRow => {
            const updatedRow = validRows.find(r => r.id === prevRow.id)
            return updatedRow || prevRow
          })
        }
        
        // Add new rows at the beginning (most recent first)
        return [...newRows, ...prev.map(prevRow => {
          const updatedRow = validRows.find(r => r.id === prevRow.id)
          return updatedRow || prevRow
        })]
      })
    } catch (error) {
      console.error('[Variants] Error in refreshRowsByIds', { error, rowIds })
    }
  }, [])

  // Debounce refresh to avoid redundant fetches when many jobs complete together
  // FIXED: Use standardized debounce time
  const scheduleRefresh = useCallback(() => {
    if (refreshTimeout.current) {
      window.clearTimeout(refreshTimeout.current)
    }
    refreshTimeout.current = window.setTimeout(() => {
      refreshRowData()
      refreshTimeout.current = null
    }, DEBOUNCE_TIMES.FULL_REFRESH)
  }, [refreshRowData])

  const { startPolling, pollingState } = useJobPolling((jobId, status) => {
    if (['succeeded', 'failed'].includes(status)) {
      // Use ref instead of pollingState to avoid closure issues
      // The ref always has the latest jobId -> rowId mapping
      const variantRowId = jobIdToRowIdRef.current[jobId] || (pollingState as any)[jobId]?.rowId as string | undefined
      
      // Prevent duplicate processing if already handling this job
      if (processingJobsRef.current.has(jobId)) {
        console.log('[Variants] Job already being processed, skipping duplicate', { jobId, variantRowId })
        return
      }
      
      // Mark as processing to prevent duplicates
      processingJobsRef.current.add(jobId)
      
      if (status === 'succeeded' && variantRowId) {
        // Retry logic for refreshing row until images appear
        const refreshWithRetry = async (retries = 5, delay = 1000) => {
          for (let i = 0; i < retries; i++) {
            try {
              // refreshSingleRow now returns true if images were found
              const hasImages = await refreshSingleRow(variantRowId, 0)
              
              // If images are available, we're done
              if (hasImages) {
                console.log('[Variants] Successfully refreshed row with images', {
                  rowId: variantRowId,
                  jobId,
                  attempts: i + 1
                })
                break
              }
              
              // If no images yet and we have retries left, wait and retry
              if (i < retries - 1) {
                console.log('[Variants] No images yet, retrying...', {
                  rowId: variantRowId,
                  jobId,
                  attempt: i + 1,
                  retriesLeft: retries - i - 1
                })
                await new Promise(resolve => setTimeout(resolve, delay))
                delay *= 2 // Exponential backoff
              }
            } catch (error) {
              console.error('[Variants] Failed to refresh row, retrying...', {
                rowId: variantRowId,
                jobId,
                attempt: i + 1,
                error
              })
              if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay))
                delay *= 2
              }
            }
          }
          
          // Clear generating state after refresh attempts (even if images not found yet)
          // The realtime subscription will catch the images when they're inserted
          setGeneratingImageRowId(prev => prev === variantRowId ? null : prev)
          // Remove from processing set
          processingJobsRef.current.delete(jobId)
        }
        
        refreshWithRetry().catch(() => {
          // Fallback: clear generating state even if refresh fails
          setGeneratingImageRowId(prev => prev === variantRowId ? null : prev)
          processingJobsRef.current.delete(jobId)
        })
      } else if (status === 'failed' && variantRowId) {
        // Clear generating state on failure
        setGeneratingImageRowId(prev => prev === variantRowId ? null : prev)
        processingJobsRef.current.delete(jobId)
      }
      
      // Clean up the mapping when job completes
      if (variantRowId) {
        delete jobIdToRowIdRef.current[jobId]
      }
      
      try {
        toast({
          title: status === 'succeeded' ? 'Generation Complete' : 'Generation Failed',
          description: `Job ${jobId.slice(0, 8)}... has ${status}`,
          variant: status === 'failed' ? 'destructive' : 'default'
        })
      } catch (error) {
        console.error('[Variants] Error showing toast:', error)
      }
      
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
      
      // Update local prompts and clear dirty flag since this is a fresh generated prompt
      setLocalPrompts(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setDirtyPrompts(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })

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

  // Create a Map for O(1) row lookups (optimized for performance)
  const rowsMap = useMemo(() => {
    const map = new Map<string, VariantRow>()
    rows.forEach(row => map.set(row.id, row))
    return map
  }, [rows])

  // Get current prompt value for a row (local state takes precedence)
  // Optimized with Map lookup instead of find() for O(1) performance
  const getCurrentPrompt = useCallback((rowId: string): string => {
    return localPrompts[rowId] ?? rowsMap.get(rowId)?.prompt ?? ''
  }, [localPrompts, rowsMap])

  // Handle prompt change (only local state update - no API calls)
  // Optimized to avoid unnecessary Set recreations
  const handlePromptChange = useCallback((rowId: string, value: string) => {
    const row = rowsMap.get(rowId)
    const currentSavedValue = row?.prompt ?? ''
    const isDirty = value !== currentSavedValue
    
    // Update local prompts immediately
    setLocalPrompts(prev => ({ ...prev, [rowId]: value }))
    
    // Only update dirty state if it actually changed
    if (isDirty) {
      setDirtyPrompts(prev => {
        // Only create new Set if rowId is not already dirty
        if (prev.has(rowId)) return prev
        const next = new Set(prev)
        next.add(rowId)
        return next
      })
    } else {
      // Only clear dirty flag if it was dirty
      setDirtyPrompts(prev => {
        if (!prev.has(rowId)) return prev
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
    }
  }, [rowsMap])

  // Handle prompt blur (save to API when user is done editing)
  const handlePromptBlur = useCallback(async (rowId: string, value: string) => {
    // Check if already saving to prevent concurrent saves
    if (savingPrompts.has(rowId)) {
      return
    }
    
    // Check if value actually changed (optimized with Map lookup)
    const row = rowsMap.get(rowId)
    const currentSavedValue = row?.prompt ?? ''
    if (value === currentSavedValue) {
      // No change, clear dirty flag only if it was dirty
      setDirtyPrompts(prev => {
        if (!prev.has(rowId)) return prev
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
      // Clear local prompt if it matches saved value
      setLocalPrompts(prev => {
        if (!(rowId in prev)) return prev
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      return
    }
    
    // Mark as saving
    setSavingPrompts(prev => new Set(prev).add(rowId))
    
    // Optimistic update: update rows state immediately
    setRows(prev => prev.map(row => 
      row.id === rowId 
        ? { ...row, prompt: value || null }
        : row
    ))
    
    try {
      // Add cache-busting timestamp to prevent stale data
      const url = new URL(`/api/variants/rows/${rowId}`, window.location.origin)
      url.searchParams.set('_t', Date.now().toString())
      
      const response = await fetch(url.toString(), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        body: JSON.stringify({
          prompt: value || undefined
        })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to save prompt: ${response.status}`)
      }
      
      const { row } = await response.json()
      
      // Update rows state with server response, but preserve existing images and dirty prompts
      // (in case user typed something new while save was in progress)
      setRows(prev => prev.map(r => {
        if (r.id !== rowId) return r
        const merged = { ...r, ...row }
        if (dirtyPromptsRef.current.has(rowId)) {
          merged.prompt = r.prompt
        }
        return merged
      }))
      
      // Clear dirty flag on success (but only if no new edits were made during save)
      if (!dirtyPromptsRef.current.has(rowId)) {
        setDirtyPrompts(prev => {
          if (!prev.has(rowId)) return prev
          const next = new Set(prev)
          next.delete(rowId)
          return next
        })
        // Clear local prompt since it's now saved (only if it exists)
        setLocalPrompts(prev => {
          if (!(rowId in prev)) return prev
          const next = { ...prev }
          delete next[rowId]
          return next
        })
      }
    } catch (error) {
      console.error('[Variants] Failed to save prompt:', error)
      
      // Revert rows state on error (optimized with Map lookup)
      const row = rowsMap.get(rowId)
      const savedValue = row?.prompt ?? ''
      setRows(prev => prev.map(r => 
        r.id === rowId 
          ? { ...r, prompt: savedValue || null }
          : r
      ))
      
      // Keep dirty flag on error so user knows it didn't save
      toast({
        title: 'Failed to save prompt',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive'
      })
    } finally {
      // Clear saving flag
      setSavingPrompts(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
    }
  }, [rows, savingPrompts, toast])

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

      // Get all image IDs from this row to clean up selection (optimized with Map lookup)
      const rowToDelete = rowsMap.get(rowId)
      const imageIdsToRemove = new Set<string>()
      if (rowToDelete?.variant_row_images) {
        rowToDelete.variant_row_images.forEach(img => {
          if (img.is_generated === true) {
            imageIdsToRemove.add(img.id)
          }
        })
      }

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

      // Clean up selection for images from deleted row
      if (imageIdsToRemove.size > 0) {
        setSelectedImageIds(prev => {
          const next = new Set(prev)
          imageIdsToRemove.forEach(id => next.delete(id))
          return next
        })
      }

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

      // Remove from selection if it was selected
      setSelectedImageIds(prev => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })

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

  // Handle toggle image selection
  const handleToggleImageSelection = useCallback((imageId: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }, [])

  // Handle select all / clear all
  const handleSelectAll = useCallback(() => {
    // Collect all generated image IDs from all rows
    const allGeneratedImageIds = new Set<string>()
    rows.forEach(row => {
      const allImages = row.variant_row_images || []
      const generatedImages = allImages.filter((img: VariantRowImage) => img.is_generated === true)
      generatedImages.forEach(img => {
        allGeneratedImageIds.add(img.id)
      })
    })

    // Check if all generated images are selected
    const allSelected = allGeneratedImageIds.size > 0 && 
      selectedImageIds.size === allGeneratedImageIds.size &&
      Array.from(selectedImageIds).every(id => allGeneratedImageIds.has(id))

    if (allSelected) {
      // Clear all if all are selected
      setSelectedImageIds(new Set())
    } else {
      // Select all
      setSelectedImageIds(allGeneratedImageIds)
    }
  }, [rows, selectedImageIds])

  // Handle bulk download selected images
  const handleBulkDownloadSelected = useCallback(async () => {
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
      
      let successCount = 0
      let failCount = 0
      
      // Fetch each selected image and add to zip
      for (const imageId of selectedImageIds) {
        // Find the image in rows
        let image: VariantRowImage | null = null
        let rowId: string | null = null
        
        for (const row of rows) {
          const images = row.variant_row_images || []
          const foundImage = images.find((img: VariantRowImage) => img.id === imageId && img.is_generated === true)
          if (foundImage) {
            image = foundImage
            rowId = row.id
            break
          }
        }

        if (!image || !rowId) {
          console.warn(`Image ${imageId} not found in rows`)
          failCount++
          continue
        }

        try {
          const imagePath = image.output_path || image.thumbnail_path || ''
          if (!imagePath) {
            console.error(`No image path available for image ${imageId}`)
            failCount++
            continue
          }

          let signedUrl: string
          try {
            const response = await getSignedUrl(imagePath)
            signedUrl = response.url
          } catch (error) {
            console.error(`Failed to get signed URL for image ${imageId}:`, error)
            failCount++
            continue
          }

          if (!signedUrl) {
            console.error(`No signed URL available for image ${imageId}`)
            failCount++
            continue
          }

          // Fetch the image as blob
          const response = await fetch(signedUrl)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const blob = await response.blob()
          
          // Determine file extension from content type, URL, or default to jpg
          let extension = 'jpg' // default
          if (blob.type) {
            if (blob.type.includes('png')) {
              extension = 'png'
            } else if (blob.type.includes('webp')) {
              extension = 'webp'
            } else if (blob.type.includes('jpeg') || blob.type.includes('jpg')) {
              extension = 'jpg'
            }
          } else {
            // Fallback: check URL for extension
            const urlLower = signedUrl.toLowerCase()
            if (urlLower.includes('.png')) {
              extension = 'png'
            } else if (urlLower.includes('.webp')) {
              extension = 'webp'
            }
          }
          
          // Add to zip with a meaningful filename
          const filename = `variant-${rowId.slice(0, 8)}-${imageId.slice(0, 8)}.${extension}`
          zip.file(filename, blob)
          successCount++
        } catch (error) {
          console.error(`Failed to fetch image ${imageId}:`, error)
          failCount++
        }
      }

      // Validate that at least one image was successfully added
      if (successCount === 0) {
        throw new Error('No images could be downloaded. Please try again.')
      }

      // Generate and download zip
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `variants-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Provide feedback on success/failure
      if (failCount > 0) {
        toast({
          title: 'Download started with warnings',
          description: `Downloaded ${successCount} image${successCount === 1 ? '' : 's'}, ${failCount} failed`,
          variant: 'default'
        })
      } else {
        toast({
          title: 'Download started',
          description: `Downloading ${successCount} image${successCount === 1 ? '' : 's'} as ZIP file`
        })
      }

      // Clear selections after download
      setSelectedImageIds(new Set())

    } catch (error) {
      console.error('Download failed:', error)
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Could not create ZIP file. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsDownloading(false)
    }
  }, [selectedImageIds, rows, toast])

  // Handle bulk delete selected images
  const handleBulkDeleteSelected = useCallback(async () => {
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
      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      // Delete each selected image
      const deletePromises = Array.from(selectedImageIds).map(async (imageId) => {
        // Find the image and its row
        let rowId: string | null = null
        
        for (const row of rows) {
          const images = row.variant_row_images || []
          const foundImage = images.find((img: VariantRowImage) => img.id === imageId && img.is_generated === true)
          if (foundImage) {
            rowId = row.id
            break
          }
        }

        if (!rowId) {
          console.warn(`Could not find row for image ${imageId}`)
          failCount++
          errors.push(`Image ${imageId.slice(0, 8)}: not found`)
          return
        }

        try {
          const response = await fetch(`/api/variants/rows/${rowId}/images/${imageId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to delete image')
          }

          successCount++
        } catch (error) {
          console.error(`Failed to delete image ${imageId}:`, error)
          failCount++
          errors.push(`Image ${imageId.slice(0, 8)}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      })

      await Promise.all(deletePromises)

      // Update local state to remove deleted images
      setRows(prev => prev.map(row => ({
        ...row,
        variant_row_images: (row.variant_row_images || []).filter(
          (img: VariantRowImage) => !selectedImageIds.has(img.id)
        )
      })))

      // Show toast with results
      if (failCount > 0) {
        toast({
          title: 'Deletion completed with errors',
          description: `Deleted ${successCount} image${successCount === 1 ? '' : 's'}, ${failCount} failed`,
          variant: 'default'
        })
      } else {
        toast({
          title: 'Images deleted successfully',
          description: `Deleted ${successCount} image${successCount === 1 ? '' : 's'}`
        })
      }

      // Clear selections after deletion
      setSelectedImageIds(new Set())
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete images',
        variant: 'destructive'
      })
    } finally {
      setIsDeleting(false)
    }
  }, [selectedImageIds, rows, toast])

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
      const jobId = data.jobId
      
      if (!jobId) {
        throw new Error('No job ID returned from server')
      }

      // Store jobId -> rowId mapping for polling callback
      jobIdToRowIdRef.current[jobId] = rowId
      
      // Start polling immediately with the jobId
      startPolling(jobId, data.status || 'queued', rowId)
      
      toast({
        title: 'Generation started',
        description: 'Images are being generated. This may take a moment.'
      })

      // Don't refresh here - let polling handle it when job completes
      // Don't clear generatingImageRowId here - let polling callback handle it on completion
    } catch (error) {
      console.error('Generate images error:', error)
      // Clear generating state on error
      setGeneratingImageRowId(null)
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Could not generate images',
        variant: 'destructive'
      })
    }
    // Removed finally block - generating state is cleared by polling callback on completion
  }, [toast, startPolling])

  // Handle reference image drag start
  const handleImageDragStart = useCallback((e: React.DragEvent, image: VariantRowImage, sourceRowId: string) => {
    e.stopPropagation()
    setDraggedImageId(image.id)
    setDraggedImageSourceRowId(sourceRowId)
    
    // Store image data in dataTransfer for drop handler
    const imageData = JSON.stringify({
      id: image.id,
      output_path: image.output_path,
      thumbnail_path: image.thumbnail_path,
      source_row_id: image.source_row_id || sourceRowId
    })
    e.dataTransfer.setData('application/x-variant-image', imageData)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  // Auto-scroll helper functions
  const startAutoScroll = useCallback((direction: 'up' | 'down', distanceFromEdge: number) => {
    // If already scrolling in the same direction, don't restart
    if (isAutoScrollingRef.current && scrollAnimationFrameRef.current !== null) {
      return
    }

    isAutoScrollingRef.current = true
    
    // Calculate scroll speed based on distance from edge (closer = faster)
    const normalizedDistance = Math.max(0, Math.min(SCROLL_THRESHOLD, distanceFromEdge))
    const speedFactor = 1 - (normalizedDistance / SCROLL_THRESHOLD) // 0 at edge, 1 at threshold
    const scrollSpeed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * (1 - speedFactor)
    
    const scrollDelta = direction === 'up' ? -scrollSpeed : scrollSpeed
    
    const scroll = () => {
      if (!isAutoScrollingRef.current) {
        return
      }
      
      window.scrollBy({ top: scrollDelta, behavior: 'auto' })
      scrollAnimationFrameRef.current = requestAnimationFrame(scroll)
    }
    
    scrollAnimationFrameRef.current = requestAnimationFrame(scroll)
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (scrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current)
      scrollAnimationFrameRef.current = null
    }
    isAutoScrollingRef.current = false
  }, [])

  // Cleanup auto-scroll on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll()
    }
  }, [stopAutoScroll])

  // Handle reference image drag end
  const handleImageDragEnd = useCallback(() => {
    setDraggedImageId(null)
    setDraggedImageSourceRowId(null)
    stopAutoScroll()
  }, [stopAutoScroll])

  // Helper function to retry operations with exponential backoff
  const retryWithBackoff = useCallback(async (
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
  }, [])

  // Helper function to refresh authentication token
  const refreshAuth = useCallback(async () => {
    const { data: { session }, error } = await supabase.auth.refreshSession()
    if (error) {
      throw new Error('Failed to refresh authentication')
    }
    return session
  }, [])

  // Copy image from one row to another
  const copyImageToRow = useCallback(async (imageData: { id: string; output_path: string; thumbnail_path: string | null; source_row_id: string | null }, targetRowId: string) => {
    setUploadingRowId(targetRowId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Prepare image data for API call (reuse existing paths, no file upload needed)
      const imagesToAdd = [{
        outputPath: imageData.output_path,
        thumbnailPath: imageData.thumbnail_path,
        sourceRowId: imageData.source_row_id || null
      }]

      const response = await fetch(`/api/variants/rows/${targetRowId}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ images: imagesToAdd })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to copy image: ${response.status} ${errorText}`)
      }

      // Optimistically update state immediately
      const responseData = await response.json()
      if (responseData.images && Array.isArray(responseData.images) && responseData.images.length > 0) {
        setRows(prev => prev.map(row => {
          if (row.id === targetRowId) {
            const existingImages = row.variant_row_images || []
            const newImages = responseData.images.map((img: any) => ({
              ...img,
              is_generated: false
            }))
            // Check for duplicates before adding
            const existingIds = new Set(existingImages.map((img: { id: string }) => img.id))
            const uniqueNewImages = newImages.filter((img: { id: string }) => !existingIds.has(img.id))
            if (uniqueNewImages.length > 0) {
              return {
                ...row,
                variant_row_images: [...existingImages, ...uniqueNewImages]
              }
            }
          }
          return row
        }))
      }
      
      // Then refresh to get full data
      await refreshSingleRow(targetRowId, 0)
      // Refresh Server Component to update initialRows prop
      setTimeout(() => {
        router.refresh()
      }, DEBOUNCE_TIMES.ROUTER_REFRESH)
      toast({ 
        title: 'Image copied',
        description: 'Reference image added to variant row'
      })
    } catch (err) {
      toast({ 
        title: 'Copy failed', 
        description: err instanceof Error ? err.message : 'Error copying image', 
        variant: 'destructive' 
      })
    } finally {
      setUploadingRowId(null)
    }
  }, [toast, refreshSingleRow, router])

  // Upload dropped files as references and add to variant row
  const addRefsFromFiles = useCallback(async (files: File[], rowId: string) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    
    setUploadingRowId(rowId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const uploadPromises = imageFiles.map(file => {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 50)
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

      // Optimistically update state immediately
      const responseData = await response.json()
      if (responseData.images && Array.isArray(responseData.images) && responseData.images.length > 0) {
        setRows(prev => prev.map(row => {
          if (row.id === rowId) {
            const existingImages = row.variant_row_images || []
            const newImages = responseData.images.map((img: any) => ({
              ...img,
              is_generated: false
            }))
            // Check for duplicates before adding
            const existingIds = new Set(existingImages.map((img: { id: string }) => img.id))
            const uniqueNewImages = newImages.filter((img: { id: string }) => !existingIds.has(img.id))
            if (uniqueNewImages.length > 0) {
              return {
                ...row,
                variant_row_images: [...existingImages, ...uniqueNewImages]
              }
            }
          }
          return row
        }))
      }
      
      // Then refresh to get full data
      await refreshSingleRow(rowId, 0)
      // Refresh Server Component to update initialRows prop
      setTimeout(() => {
        router.refresh()
      }, DEBOUNCE_TIMES.ROUTER_REFRESH)
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
    } finally {
      setUploadingRowId(null)
    }
  }, [toast, refreshSingleRow, retryWithBackoff, refreshAuth, router])

  // Handle reference image drag over
  const handleRefDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if dragging an internal image (not a file)
    const hasImageData = e.dataTransfer.types.includes('application/x-variant-image')
    if (hasImageData) {
      // Prevent dropping on the same row
      if (draggedImageSourceRowId === rowId) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
      e.dataTransfer.dropEffect = 'copy'
    }
    
    setDragOverRefRowId(rowId)
    
    // Auto-scroll detection: check if mouse is near viewport edges
    const mouseY = e.clientY
    const viewportHeight = window.innerHeight
    const distanceFromTop = mouseY
    const distanceFromBottom = viewportHeight - mouseY
    
    if (distanceFromTop < SCROLL_THRESHOLD) {
      // Near top edge - scroll up
      startAutoScroll('up', distanceFromTop)
    } else if (distanceFromBottom < SCROLL_THRESHOLD) {
      // Near bottom edge - scroll down
      startAutoScroll('down', distanceFromBottom)
    } else {
      // Outside threshold zone - stop scrolling
      stopAutoScroll()
    }
  }, [draggedImageSourceRowId, startAutoScroll, stopAutoScroll])

  // Handle reference image drag leave
  const handleRefDragLeave = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverRefRowId(null)
      // Stop auto-scrolling when leaving the drop zone
      stopAutoScroll()
    }
  }, [stopAutoScroll])

  // Handle reference image drop
  const handleRefDrop = useCallback(async (e: React.DragEvent, rowId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRefRowId(null)
    stopAutoScroll()

    // Check if this is an internal image drag (not a file)
    const imageDataString = e.dataTransfer.getData('application/x-variant-image')
    if (imageDataString) {
      try {
        const imageData = JSON.parse(imageDataString)
        
        // Prevent dropping on the same row
        if (draggedImageSourceRowId === rowId) {
          toast({
            title: 'Cannot drop on same row',
            description: 'Please drop the image on a different row',
            variant: 'destructive'
          })
          return
        }
        
        // Copy image to target row
        await copyImageToRow(imageData, rowId)
        return
      } catch (error) {
        console.error('Failed to parse image data:', error)
        toast({
          title: 'Drop failed',
          description: 'Failed to process image data',
          variant: 'destructive'
        })
        return
      }
    }

    // Handle file drops (existing functionality)
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
  }, [toast, draggedImageSourceRowId, copyImageToRow, addRefsFromFiles, stopAutoScroll])

  // Toggle row expansion
  const toggleRowExpansion = useCallback((rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
        // Store original prompt when expanding for comparison
        const row = rowsMap.get(rowId)
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

  // Group rows by output dimensions
  const groupRowsByDimensions = useCallback((rows: VariantRow[]): Map<string, VariantRow[]> => {
    const groups = new Map<string, VariantRow[]>()
    
    rows.forEach(row => {
      const width = row.output_width || 4096
      const height = row.output_height || 4096
      const key = `${width}x${height}`
      
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(row)
    })
    
    return groups
  }, [])

  // Get eligible rows for prompt generation (rows with reference images)
  const getEligibleRowsForPromptGeneration = useCallback((rows: VariantRow[]): VariantRow[] => {
    return rows.filter(row => {
      const allImages = row.variant_row_images || []
      // Check if row has at least one reference image (is_generated !== true)
      const hasReferenceImages = allImages.some(img => img.is_generated !== true)
      return hasReferenceImages
    })
  }, [])

  // Bulk toggle match_target_ratio for all rows with reference images
  // When enabled, this overrides top-level dimension controls and matches output to reference image dimensions
  const handleBulkToggleMatchReferenceDimensions = useCallback(async (targetState: boolean) => {
    // Get all rows that have at least one reference image
    const rowsWithReferences = rows.filter(row => {
      const allImages = row.variant_row_images || []
      const referenceImages = allImages.filter((img: VariantRowImage) => img.is_generated !== true)
      return referenceImages.length > 0
    })
    
    if (rowsWithReferences.length === 0) {
      toast({
        title: 'No rows with reference images',
        description: 'Add reference images to rows first to use this feature',
        variant: 'destructive'
      })
      return
    }

    // Optimistic UI update
    const previousRows = [...rows]
    setRows(prev => prev.map(r => {
      const hasReferences = (r.variant_row_images || []).some((img: VariantRowImage) => img.is_generated !== true)
      // Only update rows that have reference images
      return hasReferences ? { ...r, match_target_ratio: targetState } : r
    }))

    try {
      // Batch API calls for all rows with reference images
      const updatePromises = rowsWithReferences.map(row =>
        fetch(`/api/variants/rows/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_target_ratio: targetState })
        })
      )

      const results = await Promise.all(updatePromises)
      const failed = results.filter(r => !r.ok)
      
      if (failed.length > 0) {
        // Revert on failure
        setRows(previousRows)
        throw new Error(`Failed to update ${failed.length} of ${rowsWithReferences.length} rows`)
      }

      toast({
        title: 'Bulk update successful',
        description: targetState 
          ? `Enabled match reference dimensions for ${rowsWithReferences.length} row${rowsWithReferences.length === 1 ? '' : 's'}. Output will match reference image dimensions, overriding top-level settings.`
          : `Disabled match reference dimensions for ${rowsWithReferences.length} row${rowsWithReferences.length === 1 ? '' : 's'}. Using top-level dimension settings.`,
      })
    } catch (error) {
      toast({
        title: 'Bulk update failed',
        description: error instanceof Error ? error.message : 'Failed to update rows',
        variant: 'destructive'
      })
    }
  }, [rows, toast])

  // Bulk generate prompts for all eligible rows
  const handleBulkGeneratePrompts = useCallback(async () => {
    const eligibleRows = getEligibleRowsForPromptGeneration(rows)
    
    if (eligibleRows.length === 0) {
      toast({
        title: 'No eligible rows',
        description: 'No rows with reference images found',
        variant: 'destructive'
      })
      return
    }

    // Reset state
    setIsBulkGeneratingPrompts(true)
    bulkPromptCancelRef.current = false
    setBulkPromptProgress({ total: eligibleRows.length, completed: 0, failed: 0 })
    setBulkPromptStatus(
      eligibleRows.reduce((acc, row) => {
        acc[row.id] = 'pending'
        return acc
      }, {} as Record<string, 'pending' | 'processing' | 'success' | 'error'>)
    )

    const BATCH_SIZE = 3 // Process 3 rows concurrently
    const BATCH_DELAY = 800 // 800ms delay between batches
    const MAX_RETRIES = 2

    // Split into batches
    const batches: VariantRow[][] = []
    for (let i = 0; i < eligibleRows.length; i += BATCH_SIZE) {
      batches.push(eligibleRows.slice(i, i + BATCH_SIZE))
    }

    let completedCount = 0
    let failedCount = 0
    const failedRows: Array<{ rowId: string; error: string }> = []

    // Process batches sequentially with delay
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (bulkPromptCancelRef.current) {
        break
      }

      const batch = batches[batchIndex]
      
      // Mark batch as processing
      batch.forEach(row => {
        setBulkPromptStatus(prev => ({ ...prev, [row.id]: 'processing' }))
      })

      // Process batch concurrently
      await Promise.allSettled(
        batch.map(async (row) => {
          let retryCount = 0
          let lastError: Error | null = null
          let response: Response | null = null

          while (retryCount <= MAX_RETRIES) {
            try {
              response = await fetch(`/api/variants/rows/${row.id}/prompt/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })

              if (!response.ok) {
                // Handle rate limiting
                if (response.status === 429) {
                  const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10)
                  await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
                  retryCount++
                  continue
                }
                
                const error = await response.json()
                throw new Error(error.error || 'Failed to generate prompt')
              }

              const data = await response.json()
              const generatedPrompt = data.prompt

              // Update the row's prompt in local state
              setRows(prev => prev.map(r => {
                if (r.id === row.id) {
                  return { ...r, prompt: generatedPrompt }
                }
                return r
              }))

              setBulkPromptStatus(prev => ({ ...prev, [row.id]: 'success' }))
              completedCount++
              setBulkPromptProgress(prev => ({ ...prev, completed: completedCount }))
              return { rowId: row.id, success: true }
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error))
              
              // Exponential backoff for retries (except rate limits which are handled above)
              if (retryCount < MAX_RETRIES) {
                const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000)
                await new Promise(resolve => setTimeout(resolve, backoffDelay))
              }
              
              retryCount++
            }
          }

          // All retries failed
          setBulkPromptStatus(prev => ({ ...prev, [row.id]: 'error' }))
          failedCount++
          setBulkPromptProgress(prev => ({ ...prev, failed: failedCount }))
          failedRows.push({ rowId: row.id, error: lastError?.message || 'Unknown error' })
          return { rowId: row.id, success: false, error: lastError?.message }
        })
      )

      // Add delay between batches (except for the last batch)
      if (batchIndex < batches.length - 1 && !bulkPromptCancelRef.current) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }

    setIsBulkGeneratingPrompts(false)

    // Show completion toast
    if (bulkPromptCancelRef.current) {
      toast({
        title: 'Bulk generation cancelled',
        description: `Processed ${completedCount} of ${eligibleRows.length} rows before cancellation`
      })
    } else {
      toast({
        title: 'Bulk generation complete',
        description: `Generated ${completedCount} prompts successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        variant: failedCount > 0 ? 'default' : 'default'
      })
    }
  }, [rows, getEligibleRowsForPromptGeneration, toast])

  // Cancel bulk prompt generation
  const handleCancelBulkGeneratePrompts = useCallback(() => {
    bulkPromptCancelRef.current = true
    setIsBulkGeneratingPrompts(false)
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

  // Handle enhance prompt - uses functional state updates to avoid stale closures
  const handleEnhancePrompt = useCallback(async (rowId: string) => {
    // Get the latest prompt value including any local edits
    const currentPrompt = getCurrentPrompt(rowId) || null
    let currentInstructions: string | undefined

    setEnhanceInstructions(prev => {
      currentInstructions = prev[rowId]?.trim()
      return prev
    })

    if (!currentInstructions) {
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
      setOriginalPrompts(prev => {
        if (!prev[rowId] && currentPrompt) {
          return { ...prev, [rowId]: currentPrompt }
        }
        return prev
      })

      // Ensure any pending saves complete before enhancing
      if (savingPrompts.has(rowId)) {
        // Wait a bit for any in-flight saves to complete
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Use the current prompt value (already includes local edits from getCurrentPrompt)
      const latestPrompt: string = currentPrompt || ''

      const response = await fetch(`/api/variants/rows/${rowId}/prompt/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingPrompt: latestPrompt,
          userInstructions: currentInstructions
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to enhance prompt')
      }

      const data = await response.json()
      const enhancedPrompt = data.prompt

      // Update the row's prompt in local state and save immediately
      setRows(prev => prev.map(r => {
        if (r.id === rowId) {
          return { ...r, prompt: enhancedPrompt }
        }
        return r
      }))
      
      // Update local prompts and clear dirty flag since this is a fresh enhanced prompt
      setLocalPrompts(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setDirtyPrompts(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })

      // Save enhanced prompt to database immediately
      try {
        await fetch(`/api/variants/rows/${rowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: enhancedPrompt })
        })
      } catch (saveError) {
        console.error('[Variants] Failed to save enhanced prompt:', saveError)
        // Continue even if save fails - state is already updated
      }

      toast({
        title: currentPrompt ? 'Prompt enhanced' : 'Prompt generated',
        description: currentPrompt ? 'Variant prompt enhanced successfully' : 'Variant prompt generated from presets'
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
  }, [enhanceInstructions, toast, getCurrentPrompt, savingPrompts])

  // Handle improve prompt - automatically optimizes prompt with Seedream 4.0 guidance
  const handleImprovePrompt = useCallback(async (rowId: string) => {
    // Get the latest prompt value including any local edits
    const currentPrompt = getCurrentPrompt(rowId) || null

    if (!currentPrompt) {
      toast({
        title: 'No prompt',
        description: 'Generate a prompt first before improving',
        variant: 'destructive'
      })
      return
    }

    setImprovingRowId(rowId)
    try {
      // Store original prompt if not already stored
      setOriginalPrompts(prev => {
        if (!prev[rowId] && currentPrompt) {
          return { ...prev, [rowId]: currentPrompt }
        }
        return prev
      })

      // Ensure any pending saves complete before improving
      if (savingPrompts.has(rowId)) {
        // Wait a bit for any in-flight saves to complete
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Use the current prompt value (already includes local edits from getCurrentPrompt)
      const latestPrompt: string = currentPrompt

      const response = await fetch(`/api/variants/rows/${rowId}/prompt/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingPrompt: latestPrompt
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to improve prompt')
      }

      const data = await response.json()
      const improvedPrompt = data.prompt

      // Update the row's prompt in local state and save immediately
      setRows(prev => prev.map(r => {
        if (r.id === rowId) {
          return { ...r, prompt: improvedPrompt }
        }
        return r
      }))
      
      // Update local prompts and clear dirty flag since this is a fresh improved prompt
      setLocalPrompts(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setDirtyPrompts(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })

      // Save improved prompt to database immediately
      try {
        await fetch(`/api/variants/rows/${rowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: improvedPrompt })
        })
      } catch (saveError) {
        console.error('[Variants] Failed to save improved prompt:', saveError)
        // Continue even if save fails - state is already updated
      }

      toast({
        title: 'Prompt improved',
        description: 'Variant prompt improved with Seedream 4.0 guidance'
      })
    } catch (error) {
      console.error('Improve prompt error:', error)
      toast({
        title: 'Improvement failed',
        description: error instanceof Error ? error.message : 'Could not improve prompt',
        variant: 'destructive'
      })
    } finally {
      setImprovingRowId(null)
    }
  }, [toast, getCurrentPrompt, savingPrompts])


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
      const { modelId: eventModelId, rowsCreated, rows: eventRows } = event.detail || {}
      
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
        rowIds: eventRows?.map((r: any) => r.id) || []
      })
      
      // OPTIMIZED: Immediately add rows for instant UI, then fetch full data
      if (eventRows && Array.isArray(eventRows) && eventRows.length > 0) {
        // First, add rows optimistically with the data we have
        const rowsToAdd = eventRows.map((r: any) => ({
          ...r,
          variant_row_images: r.variant_row_images || []
        }))
        
        setRows(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newRows = rowsToAdd.filter((r: any) => {
            const id = r.id
            if (!id) {
              console.warn('[Variants] Event row missing id, skipping:', r)
              return false
            }
            if (existingIds.has(id)) {
              console.log('[Variants] Row already in state from event, skipping:', { rowId: id })
              return false
            }
            // Filter by modelId if provided
            if (modelId && r.model_id !== modelId) {
              console.log('[Variants] Row modelId mismatch in event, skipping:', { 
                rowId: id,
                rowModelId: r.model_id, 
                expectedModelId: modelId 
              })
              return false
            }
            return true
          })
          
          if (newRows.length === 0) {
            console.log('[Variants] No new rows to add from event (all already exist or filtered)')
            return prev
          }
          
          console.log('[Variants] Adding rows optimistically from event', {
            newRowsCount: newRows.length,
            rowIds: newRows.map((r: any) => r.id),
            currentCount: prev.length,
            newCount: prev.length + newRows.length
          })
          
          // Mark as recently added to prevent sync logic from removing them
          newRows.forEach((r: any) => {
            if (r.id) {
              recentlyAddedRowIdsRef.current.add(r.id)
              // Clear any existing timeout for this row
              const existingTimeout = recentlyAddedTimeoutsRef.current.get(r.id)
              if (existingTimeout) {
                clearTimeout(existingTimeout)
              }
              // Clear the "recently added" flag after router.refresh() completes (10 seconds to be safe)
              const timeoutId = setTimeout(() => {
                recentlyAddedRowIdsRef.current.delete(r.id)
                recentlyAddedTimeoutsRef.current.delete(r.id)
              }, 10000)
              recentlyAddedTimeoutsRef.current.set(r.id, timeoutId)
            }
          })
          
          return [...newRows, ...prev]
        })
        
        // Then fetch full row data to ensure we have complete information
        const rowIds = eventRows.map((r: any) => r.id).filter((id: string) => id)
        if (rowIds.length > 0) {
          // Fetch and update rows with full data (including images, model relationship, etc.)
          refreshRowsByIds(rowIds).catch((error) => {
            console.error('[Variants] Failed to fetch rows immediately, falling back to refresh', error)
            scheduleRefresh()
          })
        }
      } else {
        // No row data in event, just refresh
        scheduleRefresh()
      }
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
        
        const jobId = String(next.id)
        const variantRowId = String(next.variant_row_id)
        const s = String(next.status)
        
        // Store jobId -> rowId mapping for polling callback
        if (jobId && variantRowId) {
          jobIdToRowIdRef.current[jobId] = variantRowId
        }
        
        if (['queued','submitted','running','saving'].includes(s)) {
          // Start polling for active jobs
          startPolling(jobId, s, variantRowId)
          // Set generating state if not already set
          setGeneratingImageRowId(prev => prev || variantRowId)
        }
        if (['succeeded','failed'].includes(s)) {
          // Let polling callback handle job completion to avoid duplicate refresh attempts
          // Realtime subscription is mainly for detecting new jobs, not handling completion
          // This prevents race conditions between polling and realtime
          if (variantRowId && !processingJobsRef.current.has(jobId)) {
            // Only handle if polling hasn't already picked it up
            // This is a fallback for edge cases where polling might miss the update
            try {
              console.log('[Variants] Realtime: Job completion detected, but letting polling handle it', {
                jobId,
                variantRowId,
                status: s
              })
              // Clean up mapping - polling will handle the rest
              delete jobIdToRowIdRef.current[jobId]
            } catch (error) {
              console.error('[Variants] Error handling job completion in realtime:', error)
            }
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
        try {
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
            willFetchImmediately: true
          })
          
          // Mark as recently added to prevent sync logic from removing it
          if (newRow.id) {
            recentlyAddedRowIdsRef.current.add(newRow.id)
            const timeoutId = setTimeout(() => {
              recentlyAddedRowIdsRef.current.delete(newRow.id)
              recentlyAddedTimeoutsRef.current.delete(newRow.id)
            }, 10000) // Increased to 10 seconds to account for router.refresh() delay
            recentlyAddedTimeoutsRef.current.set(newRow.id, timeoutId)
            
            // Optimistically add row with minimal data
            setRows(prev => {
              const existingIds = new Set(prev.map(r => r.id))
              if (existingIds.has(newRow.id)) {
                return prev // Already exists
              }
              return [{
                ...newRow,
                variant_row_images: []
              }, ...prev]
            })
            
            // Then fetch full row data
            refreshSingleRow(newRow.id, 0).catch((error) => {
              console.error('[Variants] Failed to fetch row immediately via realtime, falling back to refresh', error)
              scheduleRefresh()
            })
          } else {
            // Fallback if row ID is missing
            scheduleRefresh()
          }
        } catch (error) {
          console.error('[Variants] Error handling variant row INSERT:', error)
        }
      })
      // Listen for UPDATE events (e.g., name changes, prompt updates)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'variant_rows'
      }, (payload: any) => {
        try {
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
          
          // Use ref to check if row exists
          const currentRows = rowsRef.current
          const rowExists = currentRows.some(r => r.id === updatedRow.id)
          
          if (!rowExists && modelId) {
            return // Row doesn't exist and we're filtering by modelId
          }
          
          if (updatedRow.id) {
            // Debounce to prevent rapid successive calls
            if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
            refreshTimeout.current = window.setTimeout(() => {
              refreshSingleRow(updatedRow.id, 0).catch((error) => {
                console.error('[Variants] Failed to refresh row after update:', error)
              })
              refreshTimeout.current = null
            }, DEBOUNCE_TIMES.ROW_UPDATE)
          } else {
            scheduleRefresh()
          }
        } catch (error) {
          console.error('[Variants] Error handling variant row UPDATE:', error)
        }
      })
      // Listen for DELETE events
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'variant_rows'
      }, (payload: any) => {
        try {
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
          
          // Clear recently added flag if it exists
          recentlyAddedRowIdsRef.current.delete(deletedRow.id)
          const timeoutId = recentlyAddedTimeoutsRef.current.get(deletedRow.id)
          if (timeoutId) {
            clearTimeout(timeoutId)
            recentlyAddedTimeoutsRef.current.delete(deletedRow.id)
          }
          
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
        } catch (error) {
          console.error('[Variants] Error handling variant row DELETE:', error)
        }
      })
      .subscribe()
      ;(window as any).__variantRowsRealtime = variantRowsChannel

      // Realtime subscription to variant_row_images updates
      // This ensures UI updates immediately when new images (both reference and generated) are inserted
      const imagesChannel = supabase.channel('variant-row-images')
      
      // Listen for generated image INSERTs
      imagesChannel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.true`
      }, (payload: any) => {
        try {
          const newImage = payload?.new
          if (!newImage || !newImage.variant_row_id) return
          
          console.log('[Variants] New generated image inserted via realtime', {
            imageId: newImage.id,
            variantRowId: newImage.variant_row_id,
            isGenerated: newImage.is_generated
          })
          
          // Use ref to access current state without closure dependency
          const variantRowId = String(newImage.variant_row_id)
          const currentRows = rowsRef.current
          const rowExists = currentRows.some(r => r.id === variantRowId)
          
          if (!rowExists && modelId) {
            // Row doesn't exist in current state and we're filtering by modelId, skip refresh
            return
          }
          
          if (variantRowId) {
            // Debounce to batch multiple image inserts
            if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
            refreshTimeout.current = window.setTimeout(() => {
              refreshSingleRow(variantRowId, 0).catch((error) => {
                console.error('[Variants] Failed to refresh row after generated image insert:', error)
                scheduleRefresh()
              })
              refreshTimeout.current = null
            }, DEBOUNCE_TIMES.IMAGE_INSERT)
          }
        } catch (error) {
          console.error('[Variants] Error handling generated image INSERT:', error)
        }
      })
      
      // Listen for reference image INSERTs (FIXED: was missing)
      imagesChannel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.false`
      }, (payload: any) => {
        try {
          const newImage = payload?.new
          if (!newImage || !newImage.variant_row_id) return
          
          console.log('[Variants] New reference image inserted via realtime', {
            imageId: newImage.id,
            variantRowId: newImage.variant_row_id,
            isGenerated: newImage.is_generated
          })
          
          // Use ref to access current state without closure dependency
          const variantRowId = String(newImage.variant_row_id)
          const currentRows = rowsRef.current
          const rowExists = currentRows.some(r => r.id === variantRowId)
          
          if (!rowExists && modelId) {
            return
          }
          
          if (variantRowId) {
            // Optimistically update state immediately
            setRows(prev => prev.map(row => {
              if (row.id === variantRowId) {
                const existingImages = row.variant_row_images || []
                // Check if image already exists (avoid duplicates)
                if (existingImages.some(img => img.id === newImage.id)) {
                  return row
                }
                return {
                  ...row,
                  variant_row_images: [...existingImages, {
                    ...newImage,
                    is_generated: false
                  }]
                }
              }
              return row
            }))
            
            // Then refresh to get full data
            if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
            refreshTimeout.current = window.setTimeout(() => {
              refreshSingleRow(variantRowId, 0).catch((error) => {
                console.error('[Variants] Failed to refresh row after reference image insert:', error)
                scheduleRefresh()
              })
              refreshTimeout.current = null
            }, DEBOUNCE_TIMES.IMAGE_INSERT)
          }
        } catch (error) {
          console.error('[Variants] Error handling reference image INSERT:', error)
        }
      })
      // Listen for generated image UPDATEs
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.true`
      }, (payload: any) => {
        try {
          const updatedImage = payload?.new
          if (!updatedImage || !updatedImage.variant_row_id) return
          
          console.log('[Variants] Generated image updated via realtime', {
            imageId: updatedImage.id,
            variantRowId: updatedImage.variant_row_id
          })
          
          const variantRowId = String(updatedImage.variant_row_id)
          if (variantRowId) {
            // Optimistically update state
            setRows(prev => prev.map(row => {
              if (row.id === variantRowId) {
                const existingImages = row.variant_row_images || []
                return {
                  ...row,
                  variant_row_images: existingImages.map(img => 
                    img.id === updatedImage.id ? { ...updatedImage, is_generated: true } : img
                  )
                }
              }
              return row
            }))
            
            // Then refresh to get full data
            setTimeout(() => {
              refreshSingleRow(variantRowId, 0).catch((error) => {
                console.error('[Variants] Failed to refresh row after generated image update:', error)
              })
            }, DEBOUNCE_TIMES.IMAGE_UPDATE)
          }
        } catch (error) {
          console.error('[Variants] Error handling generated image UPDATE:', error)
        }
      })
      
      // Listen for reference image UPDATEs (FIXED: was missing)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'variant_row_images',
        filter: `is_generated=eq.false`
      }, (payload: any) => {
        try {
          const updatedImage = payload?.new
          if (!updatedImage || !updatedImage.variant_row_id) return
          
          console.log('[Variants] Reference image updated via realtime', {
            imageId: updatedImage.id,
            variantRowId: updatedImage.variant_row_id
          })
          
          const variantRowId = String(updatedImage.variant_row_id)
          if (variantRowId) {
            // Optimistically update state
            setRows(prev => prev.map(row => {
              if (row.id === variantRowId) {
                const existingImages = row.variant_row_images || []
                return {
                  ...row,
                  variant_row_images: existingImages.map(img => 
                    img.id === updatedImage.id ? { ...updatedImage, is_generated: false } : img
                  )
                }
              }
              return row
            }))
            
            // Then refresh to get full data
            setTimeout(() => {
              refreshSingleRow(variantRowId, 0).catch((error) => {
                console.error('[Variants] Failed to refresh row after reference image update:', error)
              })
            }, DEBOUNCE_TIMES.IMAGE_UPDATE)
          }
        } catch (error) {
          console.error('[Variants] Error handling reference image UPDATE:', error)
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'variant_row_images'
      }, (payload: any) => {
        try {
          const deletedImage = payload?.old
          if (!deletedImage || !deletedImage.variant_row_id) return
          
          console.log('[Variants] Image deleted via realtime', {
            imageId: deletedImage.id,
            variantRowId: deletedImage.variant_row_id,
            isGenerated: deletedImage.is_generated
          })
          
          // Update state immediately to remove the deleted image (works for both reference and generated)
          setRows(prev => prev.map(row => {
            if (row.id === deletedImage.variant_row_id) {
              return {
                ...row,
                variant_row_images: row.variant_row_images?.filter(img => img.id !== deletedImage.id) || []
              }
            }
            return row
          }))

          // Clean up selection if this image was selected
          setSelectedImageIds(prev => {
            if (prev.has(deletedImage.id)) {
              const next = new Set(prev)
              next.delete(deletedImage.id)
              return next
            }
            return prev
          })
        } catch (error) {
          console.error('[Variants] Error handling image DELETE:', error)
        }
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
      // Clear processing jobs ref
      processingJobsRef.current.clear()
      // Clear recently added row timeouts
      recentlyAddedTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      recentlyAddedTimeoutsRef.current.clear()
      recentlyAddedRowIdsRef.current.clear()
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
  // Falls back to generatingImageRowId if polling state not yet available
  const getLiveStatusForRow = (rowId: string) => {
    const live = Object.values(pollingState).find(s => s.rowId === rowId && s.polling)
    if (live) return live.status
    // Fallback: if we're generating for this row but polling hasn't started yet
    if (generatingImageRowId === rowId) {
      return 'queued'
    }
    return null
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

  // Check if a job appears stuck (no update for extended period or marked as stuck)
  const isJobStuck = (rowId: string): boolean => {
    const live = Object.values(pollingState).find(s => s.rowId === rowId && s.polling)
    if (!live) return false
    
    // Check if explicitly marked as stuck
    if ((live as any).isStuck) return true
    
    // Check if job has been in active status for too long without updates
    const timeSinceLastUpdate = Date.now() - live.lastUpdate
    const timeSinceCreated = Date.now() - ((live as any).createdAt || live.lastUpdate)
    
    // Consider stuck if:
    // - No update for 2+ minutes AND job is at least 90 seconds old
    // - OR job has been active for 5+ minutes
    return (timeSinceLastUpdate > 2 * 60 * 1000 && timeSinceCreated > 90 * 1000) ||
           (timeSinceCreated > 5 * 60 * 1000 && ['queued', 'submitted', 'running', 'saving'].includes(live.status))
  }

  // Retry stuck job by triggering cleanup and re-dispatch
  const retryStuckJob = async (rowId: string) => {
    try {
      // Trigger cleanup to potentially recover the job
      await fetch('/api/jobs/cleanup', { method: 'POST', cache: 'no-store' })
      
      // Trigger dispatch to pick up any recovered jobs
      await fetch('/api/dispatch', { method: 'POST', cache: 'no-store' })
      
      // Restart polling for this row's jobs
      const rowJobs = Object.values(pollingState).filter(s => s.rowId === rowId)
      for (const jobState of rowJobs) {
        const jobId = Object.keys(pollingState).find(id => pollingState[id] === jobState)
        if (jobId) {
          startPolling(jobId, jobState.status, rowId)
        }
      }
      
      toast({
        title: 'Retry initiated',
        description: 'Attempting to recover stuck job...'
      })
    } catch (error) {
      console.error('Failed to retry stuck job:', error)
      toast({
        title: 'Retry failed',
        description: 'Could not recover stuck job. Please try again.',
        variant: 'destructive'
      })
    }
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


  // Handle add images button click
  const handleAddImagesClick = (rowId: string) => {
    const input = fileInputRefs.current.get(rowId)
    if (input) {
      input.click()
    }
  }

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>, rowId: string) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      await addRefsFromFiles(files, rowId)
      // Reset input to allow selecting same files again
      e.target.value = ''
    }
  }

  // Set file input ref callback
  const setFileInputRef = (rowId: string, element: HTMLInputElement | null) => {
    if (element) {
      fileInputRefs.current.set(rowId, element)
    } else {
      fileInputRefs.current.delete(rowId)
    }
  }

  // Handle bulk image upload using direct client-side uploads to bypass Vercel's 4.5MB limit
  const handleBulkImageUpload = async (imageFiles: File[]) => {
    setIsBulkUploading(true)
    setBulkUploadState([])

    // Add timeout protection to prevent stuck uploads
    const timeoutId = setTimeout(() => {
      console.warn('Bulk upload timeout - clearing state')
      setIsBulkUploading(false)
      setBulkUploadState([])
      toast({
        title: 'Upload timeout',
        description: 'The upload is taking longer than expected. Please try again.',
        variant: 'destructive'
      })
    }, 300000) // 5 minute timeout

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      console.log('Bulk upload starting for variants, user:', user.id, 'files:', imageFiles.length)

      // Step 1: Create all variant rows first
      const createRowPromises = imageFiles.map(async (file, index) => {
        return retryWithBackoff(async () => {
          console.log('Creating variant row for file:', file.name, 'index:', index)
          
          // Add staggered delay to prevent overwhelming the API
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 100))
          }
          
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
            const errorText = await response.text()
            console.error('Variant row creation failed:', { file: file.name, status: response.status, error: errorText })
            throw new Error(`Failed to create variant row for ${file.name}: ${response.status} ${errorText}`)
          }

          const { row } = await response.json()
          console.log('Variant row created successfully:', row.id)
          return { row, file }
        }, 5, 2000)
      })

      const createdRows = await Promise.all(createRowPromises)

      // Initialize bulk upload state
      const initialBulkState = createdRows.map(({ row, file }) => ({
        rowId: row.id,
        filename: file.name,
        status: 'pending' as const,
        progress: 0
      }))
      setBulkUploadState(initialBulkState)

      // Add new rows to the UI immediately
      const normalizedRows = createdRows.map(({ row }) => ({
        ...row,
        variant_row_images: row.variant_row_images || []
      }))
      setRows(prev => {
        const existingIds = new Set(prev.map(r => r.id))
        const newRows = normalizedRows.filter((row: any) => !existingIds.has(row.id))
        const updatedRows = [...newRows, ...prev]
        
        if (onRowsChange) {
          setTimeout(() => {
            onRowsChange(updatedRows)
          }, 0)
        }
        
        return updatedRows
      })

      // Step 2: Upload images directly to Supabase Storage and add to rows
      const BATCH_SIZE = 2
      const batches = []
      for (let i = 0; i < createdRows.length; i += BATCH_SIZE) {
        batches.push(createdRows.slice(i, i + BATCH_SIZE))
      }

      let successCount = 0
      let errorCount = 0

      for (const [batchIndex, batch] of batches.entries()) {
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} files`)
        
        const batchPromises = batch.map(async ({ row, file }, fileIndex) => {
          let uploadedFilePath: string | null = null
          try {
            // Update status to uploading
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { ...item, status: 'uploading' as const, progress: 0 }
                : item
            ))

            // Add staggered delay within batch
            if (fileIndex > 0) {
              await new Promise(resolve => setTimeout(resolve, fileIndex * 200))
            }

            // Upload image directly to Supabase Storage
            const uploadResult = await retryWithBackoff(async () => {
              await refreshAuth()
              return uploadImage(file, 'refs', user.id)
            }, 3, 1000)

            uploadedFilePath = uploadResult.objectPath

            // Add image to variant row via API
            const { data: { session } } = await supabase.auth.getSession()
            const addImageResponse = await fetch(`/api/variants/rows/${row.id}/images`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({
                images: [{
                  outputPath: uploadResult.objectPath,
                  thumbnailPath: null,
                  sourceRowId: null
                }]
              })
            })

            if (!addImageResponse.ok) {
              const errorText = await addImageResponse.text()
              throw new Error(`Failed to add image to row: ${addImageResponse.status} ${errorText}`)
            }

            // Refresh row to get full data
            await refreshSingleRow(row.id, 0)
            
            // Update bulk upload state to success
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { ...item, status: 'success' as const, progress: 100 }
                : item
            ))

            return { success: true, filename: file.name }
          } catch (error) {
            console.error(`Error uploading ${file.name}:`, error)
            
            // Cleanup: Delete uploaded file and created row if upload failed
            try {
              // Delete uploaded file from storage if it was uploaded
              if (uploadedFilePath) {
                const [bucket, ...keyParts] = uploadedFilePath.split('/')
                const key = keyParts.join('/')
                if (bucket && key) {
                  await supabase.storage.from(bucket).remove([key])
                  console.log(`Cleaned up uploaded file: ${uploadedFilePath}`)
                }
              }
              
              // Delete the created row
              const { data: { session } } = await supabase.auth.getSession()
              await fetch(`/api/variants/rows/${row.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`
                }
              })
              console.log(`Cleaned up orphaned variant row ${row.id} for failed upload: ${file.name}`)
              
              // Remove row from UI state
              setRows(prev => prev.filter(r => r.id !== row.id))
            } catch (cleanupError) {
              console.error(`Failed to cleanup row ${row.id} and file:`, cleanupError)
            }
            
            // Update bulk upload state to error
            setBulkUploadState(prev => prev.map(item => 
              item.rowId === row.id 
                ? { 
                    ...item, 
                    status: 'error' as const, 
                    progress: 0,
                    error: error instanceof Error ? error.message : 'Upload failed'
                  }
                : item
            ))

            return { success: false, filename: file.name, error }
          }
        })

        // Wait for current batch to complete
        const batchResults = await Promise.all(batchPromises)
        
        // Count results
        batchResults.forEach(result => {
          if (result.success) {
            successCount++
          } else {
            errorCount++
          }
        })

        // Delay between batches
        if (batchIndex < batches.length - 1) {
          console.log(`Waiting 2 seconds before next batch...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      // Clear timeout since upload completed
      clearTimeout(timeoutId)

      // Show completion toast
      if (successCount > 0) {
        toast({
          title: 'Bulk upload completed',
          description: `Successfully uploaded ${successCount} image${successCount === 1 ? '' : 's'}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          variant: errorCount > 0 ? 'destructive' : 'default'
        })
        // Refresh Server Component to update initialRows prop
        setTimeout(() => {
          router.refresh()
        }, DEBOUNCE_TIMES.ROUTER_REFRESH)
      }

      // Clear bulk upload state after a delay
      setTimeout(() => {
        setBulkUploadState([])
      }, 5000)
    } catch (err) {
      console.error('Bulk upload error:', err)
      
      // Clear timeout on error
      clearTimeout(timeoutId)
      
      // Update bulk state to show errors
      setBulkUploadState(prev => prev.map(item => {
        if (item.status === 'uploading' || item.status === 'pending') {
          return {
            ...item,
            status: 'error' as const,
            error: err instanceof Error ? err.message : 'Upload failed'
          }
        }
        return item
      }))
      
      toast({
        title: 'Bulk upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      // Always clear the uploading flag
      clearTimeout(timeoutId)
      setIsBulkUploading(false)
    }
  }

  // Add a row directly to state (exposed to parent components)
  const addRowToState = useCallback((row: VariantRow) => {
    console.log('[VariantsRowsWorkspace] addRowToState called:', { 
      rowId: row.id, 
      hasImages: !!row.variant_row_images,
      modelId: row.model_id,
      expectedModelId: modelId
    })
    
    // Normalize the row to ensure it has the expected structure
    const normalizedRow: VariantRow = {
      ...row,
      variant_row_images: (row.variant_row_images || []).map((img: any) => ({
        ...img,
        // Explicitly set is_generated to boolean (true for generated, false for reference)
        is_generated: img.is_generated === true
      }))
    }
    
    setRows(prev => {
      // Check if row already exists to avoid duplicates
      if (prev.some(r => r.id === normalizedRow.id)) {
        console.log('[VariantsRowsWorkspace] Row already exists, skipping:', { rowId: normalizedRow.id })
        return prev
      }
      // Filter by modelId if provided
      if (modelId && normalizedRow.model_id !== modelId) {
        console.log('[VariantsRowsWorkspace] Row modelId mismatch, skipping:', { 
          rowModelId: normalizedRow.model_id, 
          expectedModelId: modelId 
        })
        return prev // Don't add if modelId doesn't match
      }
      console.log('[VariantsRowsWorkspace] Adding row to state:', { 
        rowId: normalizedRow.id, 
        currentCount: prev.length,
        newCount: prev.length + 1 
      })
      // Mark as recently added to prevent sync logic from removing it
      recentlyAddedRowIdsRef.current.add(normalizedRow.id)
      // Clear any existing timeout for this row
      const existingTimeout = recentlyAddedTimeoutsRef.current.get(normalizedRow.id)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }
      // Clear the "recently added" flag after router.refresh() completes (10 seconds to be safe)
      const timeoutId = setTimeout(() => {
        recentlyAddedRowIdsRef.current.delete(normalizedRow.id)
        recentlyAddedTimeoutsRef.current.delete(normalizedRow.id)
      }, 10000)
      recentlyAddedTimeoutsRef.current.set(normalizedRow.id, timeoutId)
      // Add to the beginning (newest first) to match the order from the server
      return [normalizedRow, ...prev]
    })
  }, [modelId])

  // Expose addRowToState to parent component via callback
  useEffect(() => {
    if (onAddRow) {
      onAddRow(addRowToState)
    }
  }, [onAddRow, addRowToState])

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
      addRowToState(row)
      
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

      {/* Bulk Upload Drop Zone */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">Bulk upload</div>
            
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

            {/* Bulk Actions */}
            {rows.length > 0 && (() => {
              // Get rows with reference images for the bulk toggle
              const rowsWithReferences = rows.filter(row => {
                const allImages = row.variant_row_images || []
                const referenceImages = allImages.filter((img: VariantRowImage) => img.is_generated !== true)
                return referenceImages.length > 0
              })
              
              const eligibleRows = getEligibleRowsForPromptGeneration(rows)
              const hasEligibleRows = eligibleRows.length > 0
              
              // Show bulk actions if there are rows with references or eligible rows for prompt generation
              if (rowsWithReferences.length === 0 && !hasEligibleRows) return null

              // Check if all rows with references have match_target_ratio enabled
              const allRowsMatchReference = rowsWithReferences.length > 0 && 
                rowsWithReferences.every(row => Boolean((row as any).match_target_ratio))
              const noRowsMatchReference = rowsWithReferences.length > 0 && 
                rowsWithReferences.every(row => !Boolean((row as any).match_target_ratio))
              const isIndeterminate = rowsWithReferences.length > 0 && !allRowsMatchReference && !noRowsMatchReference
              const currentState = allRowsMatchReference

              return (
                <div className="p-4 bg-muted/30 border-b border-border">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm font-medium text-muted-foreground">Bulk Actions:</div>
                    
                    {/* Match Reference Dimensions Toggle - Only bulk action when enabled */}
                    {rowsWithReferences.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border border-border/50 hover:border-border transition-colors">
                        <Switch
                          checked={currentState}
                          onCheckedChange={(checked) => {
                            handleBulkToggleMatchReferenceDimensions(checked)
                          }}
                          className={isIndeterminate ? 'opacity-70' : ''}
                        />
                        <Label className="text-sm font-medium cursor-pointer">
                          Match output dimensions to reference image
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          {rowsWithReferences.length} row{rowsWithReferences.length === 1 ? '' : 's'}
                        </Badge>
                        {isIndeterminate && (
                          <span className="text-xs text-muted-foreground">(mixed)</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help ml-1" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              When enabled, output dimensions will match each row's reference image dimensions, overriding the top-level dimension settings.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    {/* Bulk Prompt Generation */}
                    {hasEligibleRows && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border border-border/50">
                        {isBulkGeneratingPrompts ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCancelBulkGeneratePrompts}
                              disabled={!isBulkGeneratingPrompts}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                            <div className="flex items-center gap-2 min-w-[200px]">
                              <Spinner size="sm" />
                              <div className="flex flex-col">
                                <div className="text-xs font-medium">
                                  Generating... ({bulkPromptProgress.completed + bulkPromptProgress.failed}/{bulkPromptProgress.total})
                                </div>
                                <Progress 
                                  value={(bulkPromptProgress.completed + bulkPromptProgress.failed) / bulkPromptProgress.total * 100} 
                                  className="h-1 w-32"
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {bulkPromptProgress.completed} ✓ {bulkPromptProgress.failed > 0 && `${bulkPromptProgress.failed} ✗`}
                              </div>
                            </div>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBulkGeneratePrompts}
                            disabled={isBulkGeneratingPrompts}
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            Generate All Prompts
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {eligibleRows.length}
                            </Badge>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Bulk Selection Actions Bar */}
            {selectedImageIds.size > 0 && (
              <div className="p-4 bg-primary/5 border-b border-border sticky top-0 z-10">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    {(() => {
                      // Calculate if all generated images are selected
                      const allGeneratedImageIds = new Set<string>()
                      rows.forEach(row => {
                        const allImages = row.variant_row_images || []
                        const generatedImages = allImages.filter((img: VariantRowImage) => img.is_generated === true)
                        generatedImages.forEach(img => {
                          allGeneratedImageIds.add(img.id)
                        })
                      })
                      const allSelected = allGeneratedImageIds.size > 0 && 
                        selectedImageIds.size === allGeneratedImageIds.size &&
                        Array.from(selectedImageIds).every(id => allGeneratedImageIds.has(id))
                      
                      return (
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                          className="h-4 w-4"
                        />
                      )
                    })()}
                    <span className="text-sm font-medium">
                      {selectedImageIds.size} image{selectedImageIds.size === 1 ? '' : 's'} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleBulkDownloadSelected}
                      disabled={isDownloading || isDeleting}
                      className="h-8 px-3 text-xs"
                    >
                      {isDownloading ? (
                        <>
                          <Spinner size="sm" className="mr-1" />
                          Downloading...
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
                      className="h-8 px-3 text-xs"
                    >
                      {isDeleting ? (
                        <>
                          <Spinner size="sm" className="mr-1" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedImageIds(new Set())
                      }}
                      className="h-8 px-3 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
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
                          dragOverRefRowId === row.id 
                            ? draggedImageSourceRowId === row.id 
                              ? 'bg-destructive/10 ring-2 ring-destructive ring-offset-2' 
                              : 'bg-primary/10 ring-2 ring-primary ring-offset-2'
                            : ''
                        }`}
                        onDragOver={(e) => handleRefDragOver(e, row.id)}
                        onDragLeave={(e) => handleRefDragLeave(e, row.id)}
                        onDrop={(e) => handleRefDrop(e, row.id)}
                      >
                        {dragOverRefRowId === row.id && (
                          <div className="mb-2 p-2 bg-primary/20 border-2 border-dashed border-primary rounded text-center text-xs font-medium text-primary">
                            {draggedImageId ? 'Drop to copy image here' : 'Drop images here'}
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          {referenceImages.slice(0, isExpanded ? 4 : 2).map((image, refIndex) => (
                            <div 
                              key={image.id} 
                              draggable={true}
                              onDragStart={(e) => handleImageDragStart(e, image, row.id)}
                              onDragEnd={handleImageDragEnd}
                              className={`group relative w-32 h-32 rounded overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 hover:border-primary/50 cursor-grab active:cursor-grabbing ${
                                draggedImageId === image.id ? 'opacity-50 scale-95' : ''
                              } ${draggedImageSourceRowId === row.id && draggedImageId ? 'ring-2 ring-primary' : ''}`}
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
                          {/* Hidden file input for this row */}
                          <input
                            ref={(el) => setFileInputRef(row.id, el)}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleFileInputChange(e, row.id)}
                          />
                          {/* Add Images button */}
                          <Button
                            onClick={() => handleAddImagesClick(row.id)}
                            disabled={uploadingRowId === row.id}
                            variant="outline"
                            size="sm"
                            className="w-full mt-1 text-xs h-7"
                          >
                            {uploadingRowId === row.id ? (
                              <>
                                <Spinner size="sm" className="mr-1" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                Add Images
                              </>
                            )}
                          </Button>
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
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleImprovePrompt(row.id)}
                                  disabled={isGenerating || improvingRowId === row.id}
                                  title="Improve prompt with Seedream 4.0 guidance"
                                >
                                  {improvingRowId === row.id ? (
                                    <Spinner size="sm" />
                                  ) : (
                                    <TrendingUp className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopyPrompt(row.prompt!)}
                                  title="Copy prompt to clipboard"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </>
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
                              value={getCurrentPrompt(row.id)}
                              onChange={(e) => handlePromptChange(row.id, e.target.value)}
                              onBlur={(e) => handlePromptBlur(row.id, e.target.value)}
                              placeholder="Type your variant prompt here, or click Sparkles to generate one from reference images..."
                              rows={isExpanded ? 8 : 4}
                              className={`resize-y text-[11px] font-mono w-[20rem] md:w-[24rem] lg:w-[28rem] xl:w-[32rem] shrink-0 border-2 transition-all duration-200 overflow-y-auto ${
                                dirtyPrompts.has(row.id)
                                  ? 'border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20 focus-visible:border-amber-500 focus-visible:ring-amber-500/20'
                                  : savingPrompts.has(row.id)
                                  ? 'border-blue-400/50 bg-blue-50/30 dark:bg-blue-950/20 focus-visible:border-blue-500 focus-visible:ring-blue-500/20'
                                  : 'border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20'
                              } shadow-sm hover:shadow-md focus-visible:shadow-lg ${
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
                            const currentModel = (row as any).generation_model || DEFAULT_MODEL_ID
                            const availableModels = getAvailableModels()
                            
                            return (
                              <>
                                {/* Model Selection Dropdown */}
                                <Select
                                  value={currentModel}
                                  onValueChange={async (value) => {
                                    try {
                                      const response = await fetch(`/api/variants/rows/${row.id}/generation-model`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ generation_model: value })
                                      })
                                      if (!response.ok) {
                                        throw new Error('Failed to update model')
                                      }
                                      // Update local state
                                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, generation_model: value } : r))
                                      toast({
                                        title: 'Model updated',
                                        description: `Switched to ${getWaveSpeedModel(value).name}`
                                      })
                                    } catch (error) {
                                      toast({
                                        title: 'Failed to update model',
                                        description: error instanceof Error ? error.message : 'Unknown error',
                                        variant: 'destructive'
                                      })
                                    }
                                  }}
                                  disabled={isActive}
                                >
                                  <SelectTrigger className="h-7 text-xs w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableModels.map((model) => (
                                      <SelectItem key={model.id} value={model.id}>
                                        {model.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                                    {(() => {
                                      const stuck = isJobStuck(row.id)
                                      return (
                                        <>
                                          <Badge 
                                            variant={stuck ? 'destructive' : (getStatusColor(displayStatus) as any)} 
                                            className={`w-fit shadow-sm ${
                                              isActive 
                                                ? stuck
                                                  ? 'ring-2 ring-destructive/30'
                                                  : 'ring-2 ring-primary/20'
                                                : ''
                                            }`}
                                          >
                                            <span className="inline-flex items-center gap-1.5">
                                              {stuck && (
                                                <AlertCircle className="h-3 w-3" />
                                              )}
                                              {isActive && !stuck && (
                                                <span className="h-2 w-2 rounded-full bg-current animate-pulse shadow-sm" />
                                              )}
                                              <span className="font-medium text-xs">
                                                {stuck ? 'Stuck' : getStatusLabel(displayStatus)}
                                              </span>
                                            </span>
                                          </Badge>
                                          {stuck && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 text-xs"
                                                  onClick={() => retryStuckJob(row.id)}
                                                >
                                                  <RefreshCw className="h-3 w-3 mr-1" />
                                                  Retry
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Attempt to recover this stuck job</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                        </>
                                      )
                                    })()}
                                    <div className="relative">
                                      <Progress 
                                        value={displayProgress} 
                                        className={`h-2 rounded-full ${
                                          isActive
                                            ? isJobStuck(row.id)
                                              ? 'bg-destructive/10'
                                              : 'bg-primary/10'
                                            : 'bg-muted'
                                        }`}
                                      />
                                      {isActive && displayProgress > 0 && !isJobStuck(row.id) && (
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
                          const livePolling = getLivePollingState(row.id)
                          
                          // Show loading skeleton during active generation when no images exist yet
                          // Also show if job just succeeded but images haven't been fetched yet
                          const isFetchingResults = liveStatus === 'succeeded' && generatedImages.length === 0 && (livePolling || isGeneratingImages)
                          const shouldShowLoading = isActive && (
                            generatedImages.length === 0 || 
                            isFetchingResults
                          )
                          
                          if (shouldShowLoading) {
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
                                <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 animate-pulse shadow-sm" />
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Spinner size="sm" />
                                  <span className="animate-pulse">
                                    {isFetchingResults 
                                      ? 'Fetching results...' 
                                      : liveStatus === 'saving'
                                      ? 'Saving images...'
                                      : liveStatus === 'running'
                                      ? 'Generating...'
                                      : 'Generating images...'}
                                  </span>
                                </div>
                              </div>
                            )
                          }
                          
                          // Show loading state if generating but have some images (partial results)
                          if (isActive && generatedImages.length > 0) {
                            return (
                              <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
                                {generatedImages.map((img: any, index: number) => {
                                  const isFavorited = favoritesState[img.id] ?? (img.is_favorited === true)
                                  const displayUrl = thumbnailUrls[img.id] || loaderThumbnailUrls[img.id] || ''
                                  
                                  return (
                                    <div 
                                      key={img.id} 
                                      className={`relative group w-32 h-32 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in ${
                                        selectedImageIds.has(img.id) 
                                          ? 'ring-2 ring-blue-500 ring-offset-2' 
                                          : ''
                                      }`}
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
                                          className={`object-cover transition-opacity duration-200 ${
                                            selectedImageIds.has(img.id) ? 'opacity-80' : ''
                                          }`}
                                          onError={() => loadThumbnail(img.id, img.thumbnail_path || img.output_path)}
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                        </div>
                                      )}
                                      
                                      {/* Selection checkbox overlay - in bottom-right */}
                                      <div 
                                        className="absolute bottom-1 right-1 z-20"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                        }}
                                      >
                                        <div className="p-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm">
                                          <Checkbox
                                            checked={selectedImageIds.has(img.id)}
                                            onCheckedChange={() => {
                                              handleToggleImageSelection(img.id)
                                            }}
                                            className="h-3.5 w-3.5"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                            }}
                                          />
                                        </div>
                                      </div>
                                      
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
                                      
                                      {/* Add to New Variant Row button - appears on hover in top-right */}
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          try {
                                            const { data: { session } } = await supabase.auth.getSession()
                                            if (!session?.access_token) {
                                              throw new Error('No valid authentication session')
                                            }

                                            const response = await fetch('/api/variants/rows/batch-add', {
                                              method: 'POST',
                                              headers: { 
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${session.access_token}`
                                              },
                                              body: JSON.stringify({
                                                images: [{
                                                  outputPath: img.output_path,
                                                  thumbnailPath: img.thumbnail_path || null,
                                                  sourceRowId: row.id
                                                }],
                                                model_id: modelId || undefined
                                              })
                                            })

                                            if (!response.ok) {
                                              const errorData = await response.json().catch(() => ({}))
                                              throw new Error(errorData.error || 'Failed to create variant row')
                                            }

                                            const result = await response.json()
                                            
                                            // Validate response data
                                            if (!result || typeof result.rowsCreated !== 'number' || typeof result.imagesAdded !== 'number') {
                                              throw new Error('Invalid response from server')
                                            }

                                            // Only show success toast if rows/images were actually created
                                            if (result.rowsCreated > 0 && result.imagesAdded > 0) {
                                              toast({
                                                title: 'New variant row created',
                                                description: `Created variant row with ${result.imagesAdded} image${result.imagesAdded === 1 ? '' : 's'}`
                                              })
                                              
                                              // Dispatch custom event to trigger variants tab refresh
                                              // Realtime subscription will also catch this, but event ensures immediate update
                                              window.dispatchEvent(new CustomEvent('variants:rows-added', {
                                                detail: {
                                                  modelId: modelId,
                                                  rowsCreated: result.rowsCreated,
                                                  rows: result.rows || []
                                                }
                                              }))
                                            } else {
                                              toast({
                                                title: 'No row created',
                                                description: 'Variant row was not created. Please try again.',
                                                variant: 'destructive'
                                              })
                                            }
                                          } catch (error) {
                                            console.error('Create variant row from result error:', error)
                                            toast({
                                              title: 'Failed to create variant row',
                                              description: error instanceof Error ? error.message : 'Unknown error',
                                              variant: 'destructive'
                                            })
                                          }
                                        }}
                                        className="absolute top-1 right-1 p-1 rounded-full transition-all duration-200 z-20 bg-black/50 hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 shadow-lg"
                                        title="Create new variant row with this image"
                                      >
                                        <Plus className="w-3.5 h-3.5 text-white" />
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
                              <div className="relative group flex flex-col items-center justify-center py-4 text-center min-h-[128px]">
                                <div className="rounded-full bg-muted/50 p-2 mb-2">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                                </div>
                                <p className="text-xs font-medium text-muted-foreground">No results yet</p>
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Generate to see results</p>
                                {/* Add button - appears on hover */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleGenerateImages(row.id)
                                  }}
                                  disabled={isGeneratingImages || generatingImageRowId === row.id}
                                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                  title="Generate variant results"
                                >
                                  <div className="rounded-full bg-primary/90 hover:bg-primary p-3 shadow-lg backdrop-blur-sm">
                                    <Plus className="w-5 h-5 text-white" />
                                  </div>
                                </button>
                              </div>
                            )
                          }

                          // Ensure we have the images array - defensive check
                          const imagesToDisplay = Array.isArray(generatedImages) 
                            ? generatedImages
                            : []

                          // Debug: Log what we're about to render
                          if (process.env.NODE_ENV === 'development') {
                            console.log('[VariantsWorkspace] Rendering results column', {
                              rowId: row.id,
                              generatedImagesCount: generatedImages.length,
                              generatedImagesIsArray: Array.isArray(generatedImages),
                              isExpanded,
                              imagesToRender: imagesToDisplay.length,
                              imageIds: imagesToDisplay.map(img => img.id),
                              allGeneratedImageIds: generatedImages.map(img => img.id)
                            })
                          }

                          return (
                            <div className="relative group/results flex flex-nowrap gap-1.5 overflow-x-auto">
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
                                    className={`relative group w-32 h-32 rounded-lg overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 hover:border-primary/50 cursor-zoom-in ${
                                      selectedImageIds.has(img.id) 
                                        ? 'ring-2 ring-blue-500 ring-offset-2' 
                                        : ''
                                    }`}
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
                                        className={`object-cover transition-opacity duration-200 ${
                                          selectedImageIds.has(img.id) ? 'opacity-80' : ''
                                        }`}
                                        onError={() => loadThumbnail(img.id, img.thumbnail_path || img.output_path)}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                                      </div>
                                    )}
                                    
                                    {/* Selection checkbox overlay - in bottom-right */}
                                    <div 
                                      className="absolute bottom-1 right-1 z-20"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                      }}
                                    >
                                      <div className="p-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm">
                                        <Checkbox
                                          checked={selectedImageIds.has(img.id)}
                                          onCheckedChange={() => {
                                            handleToggleImageSelection(img.id)
                                          }}
                                          className="h-3.5 w-3.5"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                          }}
                                        />
                                      </div>
                                    </div>
                                    
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
                                    
                                    {/* Add to New Variant Row button - appears on hover in top-right */}
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession()
                                          if (!session?.access_token) {
                                            throw new Error('No valid authentication session')
                                          }

                                          const response = await fetch('/api/variants/rows/batch-add', {
                                            method: 'POST',
                                            headers: { 
                                              'Content-Type': 'application/json',
                                              'Authorization': `Bearer ${session.access_token}`
                                            },
                                            body: JSON.stringify({
                                              images: [{
                                                outputPath: img.output_path,
                                                thumbnailPath: img.thumbnail_path || null,
                                                sourceRowId: row.id
                                              }],
                                              model_id: modelId || undefined
                                            })
                                          })

                                          if (!response.ok) {
                                            const errorData = await response.json().catch(() => ({}))
                                            throw new Error(errorData.error || 'Failed to create variant row')
                                          }

                                          const result = await response.json()
                                          
                                          // Validate response data
                                          if (!result || typeof result.rowsCreated !== 'number' || typeof result.imagesAdded !== 'number') {
                                            throw new Error('Invalid response from server')
                                          }

                                          // Only show success toast if rows/images were actually created
                                          if (result.rowsCreated > 0 && result.imagesAdded > 0) {
                                            toast({
                                              title: 'New variant row created',
                                              description: `Created variant row with ${result.imagesAdded} image${result.imagesAdded === 1 ? '' : 's'}`
                                            })
                                              
                                            // Dispatch custom event to trigger variants tab refresh
                                            // Realtime subscription will also catch this, but event ensures immediate update
                                            window.dispatchEvent(new CustomEvent('variants:rows-added', {
                                              detail: {
                                                modelId: modelId,
                                                rowsCreated: result.rowsCreated,
                                                rows: result.rows || []
                                              }
                                            }))
                                          } else {
                                            toast({
                                              title: 'No row created',
                                              description: 'Variant row was not created. Please try again.',
                                              variant: 'destructive'
                                            })
                                          }
                                        } catch (error) {
                                          console.error('Create variant row from result error:', error)
                                          toast({
                                            title: 'Failed to create variant row',
                                            description: error instanceof Error ? error.message : 'Unknown error',
                                            variant: 'destructive'
                                          })
                                        }
                                      }}
                                      className="absolute top-1 right-1 p-1 rounded-full transition-all duration-200 z-20 bg-black/50 hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 shadow-lg"
                                      title="Create new variant row with this image"
                                    >
                                      <Plus className="w-3.5 h-3.5 text-white" />
                                    </button>
                                  </div>
                                )
                              })}
                              {/* Add button - appears on hover to generate more results */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleGenerateImages(row.id)
                                }}
                                disabled={isGeneratingImages || generatingImageRowId === row.id}
                                className="flex-shrink-0 w-32 h-32 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 bg-muted/30 hover:bg-muted/50 transition-all duration-200 opacity-0 group-hover/results:opacity-100 flex items-center justify-center group/add"
                                title="Generate more variant results"
                              >
                                <div className="rounded-full bg-primary/90 hover:bg-primary p-2.5 shadow-lg backdrop-blur-sm transition-transform group-hover/add:scale-110">
                                  <Plus className="w-4 h-4 text-white" />
                                </div>
                              </button>
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

                  const enhancementRow = isExpanded ? (
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
                                title={row.prompt ? "Enhance current prompt with AI" : "Generate prompt from presets"}
                              >
                                {isEnhancing ? (
                                  <>
                                    <Spinner size="sm" className="mr-2" />
                                    {row.prompt ? 'Enhancing...' : 'Generating...'}
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-2" />
                                    {row.prompt ? 'Enhance Prompt' : 'Generate Prompt'}
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
                
                {/* Prompt Display - Only show for generated images */}
                {dialogState.imageType === 'generated' && currentImage.prompt_text && (
                  <div className="border border-border/50 rounded-xl p-5 bg-gradient-to-br from-muted/50 to-muted/30 shadow-sm mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-foreground">Prompt Used</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyPrompt(currentImage.prompt_text!)}
                        className="h-8 px-3 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1.5" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono bg-background/50 p-3 rounded-md border border-border/30">
                      {currentImage.prompt_text}
                    </p>
                  </div>
                )}
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
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete {selectedImageIds.size} selected image{selectedImageIds.size === 1 ? '' : 's'}? 
              This action cannot be undone.
            </p>
          </div>
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
              onClick={handleBulkDeleteSelected}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
