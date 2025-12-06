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

  // Check authentication before upload
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Authentication required. Please sign in to upload files.')
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    throw new Error('No valid session. Please refresh the page and try again.')
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
      // Provide more detailed error messages
      let errorMessage = error.message || 'Unknown error'
      
      // Handle specific error cases
      if (error.message?.includes('Load failed') || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.'
      } else if (error.message?.includes('new row violates row-level security')) {
        errorMessage = 'Permission denied. You may not have access to upload to this bucket.'
      } else if (error.message?.includes('Bucket not found')) {
        errorMessage = `Storage bucket '${bucket}' not found. Please contact support.`
      } else if (error.message?.includes('The resource already exists')) {
        errorMessage = 'A file with this name already exists. Please try again.'
      }
      
      console.error('Upload error details:', {
        message: error.message,
        error: (error as any).error,
        bucket,
        objectKey,
        fileSize: file.size,
        fileType: file.type,
        fullError: error
      })
      
      throw new Error(`Upload failed: ${errorMessage}`)
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
    
    // Re-throw if it's already a formatted Error
    if (error instanceof Error) {
      throw error
    }
    
    // Handle network errors
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMsg = String(error.message)
      if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('Load failed')) {
        throw new Error('Network error. Please check your connection and try again.')
      }
    }
    
    throw new Error('Upload failed. Please try again.')
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
  maxSizeMB: number = 50
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
  validateFile(file, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 50)
  
  return uploadToBucket(file, bucket, keyPrefix, {
    ...options,
    contentType: file.type
  })
}
