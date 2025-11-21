export interface VariantImage {
  id: string
  outputPath: string
  thumbnailPath: string | null
  sourceRowId?: string
}

export interface VariantRowImage {
  id: string
  variant_row_id: string
  output_path: string
  thumbnail_path: string | null
  source_row_id: string | null
  position: number
  created_at: string
}

export interface VariantRow {
  id: string
  user_id: string
  team_id: string
  name: string | null
  prompt: string | null
  output_width?: number
  output_height?: number
  created_at: string
  updated_at: string
  variant_row_images?: VariantRowImage[]
}

export interface VariantPromptGenerateRequest {
  imagePaths: string[]
}

export interface VariantPromptGenerateResponse {
  prompt: string
}

export interface VariantPromptEnhanceRequest {
  existingPrompt: string
  userInstructions: string
  imagePaths: string[]
}

export interface VariantPromptEnhanceResponse {
  prompt: string
}

export interface BatchAddImagesRequest {
  images: Array<{
    outputPath: string
    thumbnailPath?: string | null
    sourceRowId?: string | null
  }>
}

export interface BatchAddImagesResponse {
  rowsCreated: number
  imagesAdded: number
  rows: Array<{
    id: string
    imageCount: number
    sourceRowId: string | null
  }>
}

