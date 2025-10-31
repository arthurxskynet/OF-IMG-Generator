import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MAX_THUMBNAIL_DIMENSION = 800

/**
 * Generate a thumbnail from an image buffer
 * Resizes proportionally with max 800px on longest side
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  maxDimension: number = MAX_THUMBNAIL_DIMENSION
): Promise<Buffer> {
  const image = sharp(imageBuffer)
  const metadata = await image.metadata()
  
  // Calculate proportional dimensions
  let width = metadata.width || 1
  let height = metadata.height || 1
  
  if (width > height) {
    if (width > maxDimension) {
      height = Math.round((height / width) * maxDimension)
      width = maxDimension
    }
  } else {
    if (height > maxDimension) {
      width = Math.round((width / height) * maxDimension)
      height = maxDimension
    }
  }
  
  return await image
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ 
      quality: 85,
      mozjpeg: true 
    })
    .toBuffer()
}

/**
 * Download full image, generate thumbnail, and upload both
 * Returns both original and thumbnail object paths
 */
export async function createAndUploadThumbnail(
  remoteUrl: string,
  userId: string,
  originalObjectPath: string
): Promise<{ thumbnailPath: string }> {
  const supabase = supabaseAdmin
  
  try {
    // Download the original image
    const response = await fetch(remoteUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    
    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(imageBuffer)
    
    // Create thumbnail filename with thumb_ prefix
    const [bucket, ...rest] = originalObjectPath.split('/')
    const originalKey = rest.join('/')
    const pathParts = originalKey.split('/')
    const filename = pathParts[pathParts.length - 1]
    const thumbnailKey = `${pathParts.slice(0, -1).join('/')}/thumb_${filename}`
    
    // Upload thumbnail to outputs bucket
    const { error: uploadError } = await supabase.storage
      .from('outputs')
      .upload(thumbnailKey, thumbnailBuffer, {
        contentType: 'image/jpeg',
        upsert: false
      })
    
    if (uploadError) {
      throw new Error(`Failed to upload thumbnail: ${uploadError.message}`)
    }
    
    return {
      thumbnailPath: `outputs/${thumbnailKey}`
    }
  } catch (error) {
    console.error('[ThumbnailGenerator] Error creating thumbnail:', error)
    throw error
  }
}

/**
 * Generate thumbnail from existing storage file
 * Useful for migration scripts
 */
export async function generateThumbnailFromStorage(
  objectPath: string,
  userId: string
): Promise<string> {
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  
  // Download the original from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(key)
  
  if (downloadError || !fileData) {
    throw new Error(`Failed to download image: ${downloadError?.message || 'No data'}`)
  }
  
  // Convert to buffer
  const imageBuffer = Buffer.from(await fileData.arrayBuffer())
  
  // Generate thumbnail
  const thumbnailBuffer = await generateThumbnail(imageBuffer)
  
  // Create thumbnail filename
  const pathParts = key.split('/')
  const filename = pathParts[pathParts.length - 1]
  const thumbnailKey = `${pathParts.slice(0, -1).join('/')}/thumb_${filename}`
  
  // Upload thumbnail
  const { error: uploadError } = await supabase.storage
    .from('outputs')
    .upload(thumbnailKey, thumbnailBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    })
  
  if (uploadError) {
    throw new Error(`Failed to upload thumbnail: ${uploadError.message}`)
  }
  
  return `outputs/${thumbnailKey}`
}


