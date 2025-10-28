'use client'

import { ModelWorkspace } from './model-workspace'
import { ModelRowsPage } from '@/types/model-api'

interface ModelWorkspaceWrapperProps {
  initialPage: ModelRowsPage
  sort?: string
}

export function ModelWorkspaceWrapper({ initialPage, sort }: ModelWorkspaceWrapperProps) {
  return (
    <ModelWorkspace
      model={initialPage.model}
      rows={initialPage.rows}
      sort={sort}
      initialPage={initialPage}
    />
  )
}
