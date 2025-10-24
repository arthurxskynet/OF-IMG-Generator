'use client'

import { ModelWorkspace } from './model-workspace'
import { Model, ModelRow } from '@/types/jobs'

interface ModelWorkspaceWrapperProps {
  model: Model
  rows: ModelRow[]
  sort?: string
}

export function ModelWorkspaceWrapper({ model, rows, sort }: ModelWorkspaceWrapperProps) {
  return <ModelWorkspace model={model} rows={rows} sort={sort} />
}
