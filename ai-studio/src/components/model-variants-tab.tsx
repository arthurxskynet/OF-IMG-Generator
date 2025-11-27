'use client'

import { useState, useRef, useEffect } from 'react'
import { VariantsRowsWorkspace } from '@/components/variants/variants-rows-workspace'
import { VariantRow } from '@/types/variants'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ModelVariantsTabContentProps {
  modelId: string
  initialRows: VariantRow[]
  onRowsChange?: (rows: VariantRow[]) => void
}

export function ModelVariantsTabContent({ modelId, initialRows, onRowsChange }: ModelVariantsTabContentProps) {
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
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

      // Add row to workspace state immediately for instant UI update
      if (addRowRef.current) {
        addRowRef.current(row)
      } else {
        // Fallback: if callback not available, rely on realtime subscription
        // Also add a delayed refresh as a safety net (in case realtime doesn't fire)
        console.warn('[ModelVariantsTab] addRow callback not available, relying on realtime subscription')
        setTimeout(() => {
          // Trigger a refresh via custom event (workspace listens to this)
          window.dispatchEvent(new CustomEvent('variants:rows-added', {
            detail: {
              modelId: modelId,
              rowsCreated: 1,
              rows: [row]
            }
          }))
        }, 1000) // 1 second delay as fallback
      }

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

