'use client'

import { useEffect } from 'react'
import { VariantsRowsWorkspace } from '@/components/variants/variants-rows-workspace'
import { VariantRow } from '@/types/variants'

interface ModelVariantsTabContentProps {
  modelId: string
  initialRows: VariantRow[]
  onRowsChange?: (rows: VariantRow[]) => void
}

export function ModelVariantsTabContent({ modelId, initialRows, onRowsChange }: ModelVariantsTabContentProps) {
  // Expose rows state to parent for badge count updates
  // We'll use a ref to track the latest rows from VariantsRowsWorkspace
  // Since VariantsRowsWorkspace manages its own state, we'll listen to it via a custom event or prop callback
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Variants</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage variant rows for this model
          </p>
        </div>
      </div>
      <VariantsRowsWorkspace 
        initialRows={initialRows} 
        modelId={modelId}
        onRowsChange={onRowsChange}
      />
    </div>
  )
}

