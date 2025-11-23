'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModelWorkspaceWrapper } from '@/components/model-workspace-wrapper'
import { ModelVariantsTabContent } from '@/components/model-variants-tab'
import { Model } from '@/types/jobs'
import { VariantRow } from '@/types/variants'

interface ModelTabsContentProps {
  model: Model
  rows: any[]
  sort?: string
  variantRows: VariantRow[]
}

interface ModelTabsContentProps {
  model: Model
  rows: any[]
  sort?: string
  variantRows: VariantRow[]
  defaultTab?: string
}

export function ModelTabsContent({ model, rows, sort, variantRows: initialVariantRows, defaultTab = 'rows' }: ModelTabsContentProps) {
  // Track variant count dynamically so it updates when new variants are added
  const [variantCount, setVariantCount] = useState(initialVariantRows.length)

  // Update count when initial rows change (e.g., after page refresh)
  useEffect(() => {
    setVariantCount(initialVariantRows.length)
  }, [initialVariantRows.length])

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
        <TabsTrigger value="rows">Rows</TabsTrigger>
        <TabsTrigger value="variants">
          Variants
          {variantCount > 0 && (
            <span className="ml-2 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-xs font-medium">
              {variantCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rows" className="mt-0">
        <ModelWorkspaceWrapper model={model} rows={rows} sort={sort} />
      </TabsContent>
      <TabsContent value="variants" className="mt-0">
        <ModelVariantsTabContent 
          modelId={model.id} 
          initialRows={initialVariantRows}
          onRowsChange={(newRows) => setVariantCount(newRows.length)}
        />
      </TabsContent>
    </Tabs>
  )
}

