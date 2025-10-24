'use client'

import { ModelWorkspace } from './model-workspace'
import { Model } from '@/types/jobs'

interface ModelWorkspaceWrapperProps {
  model: Model
  rows: any[]
  sort?: string
}

export function ModelWorkspaceWrapper({ model, rows, sort }: ModelWorkspaceWrapperProps) {
  return <ModelWorkspace model={model} rows={rows} sort={sort} />
}
