'use client'

import { useState } from 'react'
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

      toast({
        title: 'Variant row created',
        description: 'New variant row created successfully. Add reference images to get started.'
      })

      // The new row will appear automatically via realtime sync in VariantsRowsWorkspace
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
      />
    </div>
  )
}

