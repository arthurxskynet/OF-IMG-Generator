'use client'

import { createClient } from '@/lib/supabase-browser'

export interface UploadResult {
  bucket: string
  objectKey: string
  objectPath: string
  publicUrl?: string
}

export interface UploadOptions {
  contentType?: string
  upsert?: boolean
  onProgress?: (progress: number) => void
}

/**
 * Upload a file to a Supabase Storage bucket
 * @param file - The file to upload
 * @param bucket - The bucket name (e.g., 'refs', 'targets', 'outputs')
 * @param keyPrefix - The key prefix (e.g., userId for user-scoped uploads)
 * @param options - Upload options
 * @returns Promise with upload result
 */
export async function uploadToBucket(
  file: File,
  bucket: string,
  keyPrefix: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const supabase = createClient()
  
  // Validate file
  if (!file) {
    throw new Error('No file provided')
  }

  // Generate unique key
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const objectKey = `${keyPrefix}/${timestamp}-${randomSuffix}-${sanitizedName}`

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(objectKey, file, {
        contentType: options.contentType || file.type,
        upsert: options.upsert || false
      })

    if (error) {
      throw new Error(`Upload failed: ${error.message}`)
    }

    if (!data?.path) {
      throw new Error('Upload succeeded but no path returned')
    }

    return {
      bucket,
      objectKey: data.path,
      objectPath: `${bucket}/${data.path}`
    }
  } catch (error) {
    console.error('Upload error:', error)
    throw error instanceof Error ? error : new Error('Upload failed')
  }
}

/**
 * Validate file type and size
 * @param file - The file to validate
 * @param allowedTypes - Array of allowed MIME types
 * @param maxSizeMB - Maximum file size in MB
 */
export function validateFile(
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeMB: number = 10
): void {
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`File type ${file.type} not allowed. Allowed types: ${allowedTypes.join(', ')}`)
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    throw new Error(`File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum ${maxSizeMB}MB`)
  }
}

/**
 * Upload an image file with validation
 * @param file - The image file to upload
 * @param bucket - The bucket name
 * @param keyPrefix - The key prefix
 * @param options - Upload options
 */
export async function uploadImage(
  file: File,
  bucket: string,
  keyPrefix: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  // Validate image file
  validateFile(file, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 10)
  
  return uploadToBucket(file, bucket, keyPrefix, {
    ...options,
    contentType: file.type
  })
}
