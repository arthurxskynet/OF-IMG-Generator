'use client'

import { ModelWorkspace } from './model-workspace'
import { Model, ModelRow } from '@/types/jobs'

interface ModelWorkspaceWrapperProps {
  model: Model
  rows: ModelRow[]
  sort?: string
  rowId?: string
}

export function ModelWorkspaceWrapper({ model, rows, sort, rowId }: ModelWorkspaceWrapperProps) {
  return <ModelWorkspace model={model} rows={rows} sort={sort} rowId={rowId} />
}
