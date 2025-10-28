export interface ModelLibraryAsset {
  id: string
  model_id: string
  created_by: string
  bucket: string
  object_path: string
  label?: string | null
  created_at: string
  updated_at: string
}

export interface CreateLibraryAssetPayload {
  bucket: string
  objectPath: string
  label?: string | null
}
