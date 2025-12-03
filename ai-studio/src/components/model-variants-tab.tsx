'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { VariantsRowsWorkspace } from '@/components/variants/variants-rows-workspace'
import { VariantRow } from '@/types/variants'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DEBOUNCE_TIMES } from '@/lib/debounce'

interface ModelVariantsTabContentProps {
  modelId: string
  initialRows: VariantRow[]
  onRowsChange?: (rows: VariantRow[]) => void
}

export function ModelVariantsTabContent({ modelId, initialRows, onRowsChange }: ModelVariantsTabContentProps) {
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const addRowRef = useRef<((row: VariantRow) => void) | null>(null)

  const handleCreateNewRow = async () => {
    setIsCreating(true)
    try {
      const response = await fetch('/api/variants/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create variant row')
      }

      const { row } = await response.json()

      console.log('[ModelVariantsTab] Row created:', { rowId: row.id, modelId: row.model_id })

      // Strategy: Add row immediately for instant UI, then fetch full data
      // Ensure row has variant_row_images array (even if empty) for immediate display
      const rowWithImages = {
        ...row,
        variant_row_images: row.variant_row_images || []
      }

      // Add row to workspace state immediately for instant UI update
      // This must happen BEFORE router.refresh() to ensure the row appears immediately
      if (addRowRef.current) {
        console.log('[ModelVariantsTab] Adding row via callback:', { rowId: row.id })
        addRowRef.current(rowWithImages)
      } else {
        console.warn('[ModelVariantsTab] addRowRef.current is null, using event fallback')
      }

      // Always trigger custom event to ensure workspace fetches full row data
      // This ensures we get complete data including model relationship, etc.
      // The event handler will also add the row if the callback didn't work
      window.dispatchEvent(new CustomEvent('variants:rows-added', {
        detail: {
          modelId: modelId,
          rowsCreated: 1,
          rows: [rowWithImages] // Use rowWithImages to ensure variant_row_images is included
        }
      }))

      // Refresh Server Component to update initialRows prop
      // Delay slightly to ensure local state update completes first
      // This prevents the Server Component from overwriting the optimistic update
      setTimeout(() => {
        router.refresh()
      }, DEBOUNCE_TIMES.ROUTER_REFRESH)

      toast({
        title: 'Variant row created',
        description: 'New variant row created successfully. Add reference images to get started.'
      })
    } catch (error) {
      console.error('Create variant row error:', error)
      toast({
        title: 'Creation failed',
        description: error instanceof Error ? error.message : 'Failed to create variant row',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleAddRowCallback = (addRow: (row: VariantRow) => void) => {
    addRowRef.current = addRow
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Variants</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage variant rows for this model
          </p>
        </div>
        <Button 
          onClick={handleCreateNewRow}
          disabled={isCreating}
          className="shadow-md hover:shadow-lg transition-shadow group"
        >
          <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110 group-hover:rotate-12" />
          {isCreating ? 'Creating...' : 'New Variant Row'}
        </Button>
      </div>
      <VariantsRowsWorkspace 
        initialRows={initialRows} 
        modelId={modelId}
        onRowsChange={onRowsChange}
        onAddRow={handleAddRowCallback}
      />
    </div>
  )
}

