import { supabaseAdmin } from '@/lib/supabase-admin'
import { createAndUploadThumbnail } from './thumbnail-generator'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Normalize storage path to consistent format: "bucket/user_id/filename"
 * Handles paths with/without leading slashes, with/without bucket prefix
 * @param path Storage path in various formats
 * @returns Normalized path in format "bucket/user_id/filename" or null if invalid
 */
export function normalizeStoragePath(path: string | null | undefined): string | null {
  if (!path) return null
  
  // Remove leading/trailing slashes and normalize
  let normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  
  if (!normalized) return null
  
  // Split into parts
  const parts = normalized.split('/').filter(p => p.length > 0)
  
  if (parts.length < 2) {
    // Path is too short - might be missing bucket or user_id
    // If it looks like just a filename, we can't normalize it without context
    console.warn('[Storage] Path too short to normalize:', path)
    return null
  }
  
  // Check if first part is a known bucket name
  const knownBuckets = ['outputs', 'refs', 'targets', 'thumbnails']
  const firstPart = parts[0]
  
  // If first part is not a known bucket, assume it's missing and try to infer
  // This handles cases where path is just "user_id/filename"
  if (!knownBuckets.includes(firstPart)) {
    // Check if first part looks like a UUID (user_id)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(firstPart)) {
      // Path is "user_id/filename" - we need to infer bucket
      // For variant rows, reference images are typically in 'refs' or 'outputs'
      // We'll default to 'outputs' as it's most common
      console.warn('[Storage] Path missing bucket prefix, inferring "outputs":', path)
      return `outputs/${normalized}`
    }
    
    // Can't normalize - return null
    console.warn('[Storage] Cannot normalize path - unknown format:', path)
    return null
  }
  
  // Path already has bucket - return as-is (already normalized)
  return normalized
}

/**
 * Extract user_id from storage path
 * Path format: "bucket/user_id/filename.ext"
 * Returns null if path doesn't match expected format
 */
export function extractUserIdFromStoragePath(objectPath: string): string | null {
  if (!objectPath) return null
  
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  
  if (!key) return null
  
  // Check if key starts with a UUID (user_id)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//
  if (uuidRegex.test(key)) {
    const userId = key.split('/')[0]
    return userId
  }
  
  return null
}

/**
 * Verify user owns the storage file (or is admin)
 * @param objectPath Storage path in format "bucket/user_id/filename.ext" or "bucket/filename.ext"
 * @param userId User ID to verify ownership
 * @param supabase Supabase client (with user context)
 * @param isAdmin Whether user is admin (optional, will be checked if not provided)
 */
export async function verifyStorageOwnership(
  objectPath: string,
  userId: string,
  supabase: SupabaseClient,
  isAdmin?: boolean
): Promise<boolean> {
  if (!objectPath || !userId) return false
  
  // Check admin status if not provided
  if (isAdmin === undefined) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single()
    
    isAdmin = profile?.is_admin === true
  }
  
  // Admin can access all files
  if (isAdmin) return true
  
  // Extract user_id from path (fast path - preferred)
  const pathUserId = extractUserIdFromStoragePath(objectPath)
  
  // If path has user_id, verify it matches
  if (pathUserId) {
    return pathUserId === userId
  }
  
  // If path doesn't have user_id, check database ownership (fallback for legacy images)
  // Normalize the path for matching - handle both full paths and key-only paths
  const normalizedPath = objectPath.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  const [bucket, ...keyParts] = normalizedPath.split('/')
  const key = keyParts.join('/')
  
  if (!key) return false
  
  // Helper to normalize paths for comparison
  const normalizeForMatch = (path: string | null | undefined): string | null => {
    if (!path) return null
    // Remove leading slashes and normalize
    return path.replace(/^\/+/, '').replace(/\/{2,}/g, '/').toLowerCase()
  }
  
  // Helper to extract key from full path (removes bucket prefix)
  const extractKey = (path: string | null | undefined): string | null => {
    if (!path) return null
    const normalized = normalizeForMatch(path)
    if (!normalized) return null
    const parts = normalized.split('/')
    if (parts.length < 2) return normalized
    // Remove bucket (first part) and return the rest
    return parts.slice(1).join('/')
  }
  
  const normalizedKey = normalizeForMatch(key)
  const normalizedFullPath = normalizeForMatch(normalizedPath)
  
  // Check generated_images table - try exact match first, then partial
  try {
    // Try multiple matching strategies
    let genImages: any = null
    
    // Strategy 1: Exact match on full path
    const exactMatch = await supabase
      .from('generated_images')
      .select('id, user_id, team_id, output_url, thumbnail_url')
      .or(`output_url.eq.${normalizedPath},thumbnail_url.eq.${normalizedPath}`)
      .limit(5)
    
    if (exactMatch.data && exactMatch.data.length > 0) {
      genImages = exactMatch
    } else {
      // Strategy 2: Partial match using ilike (case-insensitive)
      const partialMatch = await supabase
        .from('generated_images')
        .select('id, user_id, team_id, output_url, thumbnail_url')
        .or(`output_url.ilike.%${key}%,thumbnail_url.ilike.%${key}%`)
        .limit(50) // Increased limit for better matching
      
      if (partialMatch.data && partialMatch.data.length > 0) {
        genImages = partialMatch
      }
    }
    
    if (genImages?.data && genImages.data.length > 0) {
      // Find the best match (exact match preferred, then endsWith, then contains)
      const matchingImage = genImages.data.find((img: any) => {
        const outputNorm = normalizeForMatch(img.output_url)
        const thumbNorm = normalizeForMatch(img.thumbnail_url)
        const outputKey = extractKey(img.output_url)
        const thumbKey = extractKey(img.thumbnail_url)
        
        // Exact match (full path)
        if (outputNorm === normalizedFullPath || thumbNorm === normalizedFullPath) return true
        // Exact match (key only - comparing extracted keys)
        if (outputKey === normalizedKey || thumbKey === normalizedKey) return true
        // Exact match (key only - comparing full normalized paths)
        if (outputNorm === normalizedKey || thumbNorm === normalizedKey) return true
        // Ends with key (most reliable for partial matches)
        if ((outputNorm && normalizedKey && outputNorm.endsWith(normalizedKey)) || (thumbNorm && normalizedKey && thumbNorm.endsWith(normalizedKey))) return true
        // Contains key (fallback)
        if ((outputNorm && normalizedKey && outputNorm.includes(normalizedKey)) || (thumbNorm && normalizedKey && thumbNorm.includes(normalizedKey))) return true
        
        return false
      })
      
      if (matchingImage) {
        // Check if user owns the image directly
        if (matchingImage.user_id === userId) return true
        
        // Check team membership if image belongs to a team
        if (matchingImage.team_id) {
          const { data: teamMember } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', matchingImage.team_id)
            .eq('user_id', userId)
            .maybeSingle()
          
          if (teamMember) return true
          
          // Check if user is team owner
          const { data: team } = await supabase
            .from('teams')
            .select('owner_id')
            .eq('id', matchingImage.team_id)
            .maybeSingle()
          
          if (team?.owner_id === userId) return true
        }
      }
    }
  } catch (error) {
    console.warn('[Storage] Error checking generated_images ownership:', error)
  }
  
  // Check variant_row_images table
  try {
    // Try multiple matching strategies
    let variantImages: any = null
    
    // Strategy 1: Exact match on full path
    const exactMatch = await supabase
      .from('variant_row_images')
      .select('id, output_path, thumbnail_path, variant_rows!inner(user_id, model_id)')
      .or(`output_path.eq.${normalizedPath},thumbnail_path.eq.${normalizedPath}`)
      .limit(5)
    
    if (exactMatch.data && exactMatch.data.length > 0) {
      variantImages = exactMatch
    } else {
      // Strategy 2: Partial match using ilike (case-insensitive)
      const partialMatch = await supabase
        .from('variant_row_images')
        .select('id, output_path, thumbnail_path, variant_rows!inner(user_id, model_id)')
        .or(`output_path.ilike.%${key}%,thumbnail_path.ilike.%${key}%`)
        .limit(50) // Increased limit for better matching
      
      if (partialMatch.data && partialMatch.data.length > 0) {
        variantImages = partialMatch
      }
    }
    
    if (variantImages?.data && variantImages.data.length > 0) {
      // Find the best match
      const matchingImage = variantImages.data.find((img: any) => {
        const outputNorm = normalizeForMatch(img.output_path)
        const thumbNorm = normalizeForMatch(img.thumbnail_path)
        const outputKey = extractKey(img.output_path)
        const thumbKey = extractKey(img.thumbnail_path)
        
        // Exact match (full path)
        if (outputNorm === normalizedFullPath || thumbNorm === normalizedFullPath) return true
        // Exact match (key only - comparing extracted keys)
        if (outputKey === normalizedKey || thumbKey === normalizedKey) return true
        // Exact match (key only - comparing full normalized paths)
        if (outputNorm === normalizedKey || thumbNorm === normalizedKey) return true
        // Ends with key (most reliable for partial matches)
        if ((outputNorm && normalizedKey && outputNorm.endsWith(normalizedKey)) || (thumbNorm && normalizedKey && thumbNorm.endsWith(normalizedKey))) return true
        // Contains key (fallback)
        if ((outputNorm && normalizedKey && outputNorm.includes(normalizedKey)) || (thumbNorm && normalizedKey && thumbNorm.includes(normalizedKey))) return true
        
        return false
      })
      
      if (matchingImage) {
        const variantRow = Array.isArray(matchingImage.variant_rows) 
          ? matchingImage.variant_rows[0] 
          : matchingImage.variant_rows
        
        if (variantRow) {
          // If variant row has user_id, check direct ownership
          if (variantRow.user_id === userId) return true
          
          // If variant row has model_id, check model access
          if (variantRow.model_id) {
            const { data: model } = await supabase
              .from('models')
              .select('id, owner_id, team_id')
              .eq('id', variantRow.model_id)
              .maybeSingle()
            
            if (model) {
              if (model.owner_id === userId) return true
              
              if (model.team_id) {
                const { data: teamMember } = await supabase
                  .from('team_members')
                  .select('id')
                  .eq('team_id', model.team_id)
                  .eq('user_id', userId)
                  .maybeSingle()
                
                if (teamMember) return true
                
                const { data: team } = await supabase
                  .from('teams')
                  .select('owner_id')
                  .eq('id', model.team_id)
                  .maybeSingle()
                
                if (team?.owner_id === userId) return true
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Storage] Error checking variant_row_images ownership:', error)
  }
  
  // If we can't verify ownership via path or database, deny access
  // Log for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Storage] Ownership verification failed:', {
      objectPath,
      userId,
      hasPathUserId: !!pathUserId,
      pathUserId
    })
  }
  return false
}

/** Check if a file exists in storage by attempting to list it */
export async function checkFileExists(objectPath: string, userId?: string, userSupabase?: SupabaseClient): Promise<boolean> {
  if (!objectPath) return false
  
  // If user context provided, verify ownership first
  if (userId && userSupabase) {
    const hasAccess = await verifyStorageOwnership(objectPath, userId, userSupabase)
    if (!hasAccess) {
      console.warn('[Storage] Access denied - user does not own file:', { objectPath, userId })
      return false
    }
  } else {
    // No user context - verify path structure is valid (contains user_id)
    const pathUserId = extractUserIdFromStoragePath(objectPath)
    if (!pathUserId) {
      // Path doesn't have user_id - can't verify without user context
      console.warn('[Storage] Cannot verify path without user context:', { objectPath })
      return false
    }
  }
  
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  
  if (!bucket || !key) return false
  
  try {
    // Split key into directory and filename
    const pathParts = key.split('/')
    const fileName = pathParts.pop() || ''
    const directory = pathParts.join('/')
    
    // List files in the directory and check if our file exists
    // Note: Supabase list doesn't support search parameter, so we list and filter
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(directory || '', {
        limit: 1000
      })
    
    if (error) {
      // If listing fails, assume file doesn't exist
      return false
    }
    
    // Check if the file name matches (case-sensitive match)
    return data?.some(file => file.name === fileName) ?? false
  } catch {
    return false
  }
}

/** objectPath is "bucket/objectKey" */
export async function signPath(
  objectPath: string, 
  expiresIn = 14400,
  userId?: string,
  userSupabase?: SupabaseClient
): Promise<string | null> {
  if (!objectPath) return null
  
  // If user context provided, verify ownership first
  if (userId && userSupabase) {
    const hasAccess = await verifyStorageOwnership(objectPath, userId, userSupabase)
    if (!hasAccess) {
      console.warn('[Storage] Access denied - user does not own file:', { objectPath, userId })
      return null
    }
  } else {
    // No user context - verify path structure is valid (contains user_id)
    const pathUserId = extractUserIdFromStoragePath(objectPath)
    if (!pathUserId) {
      // Path doesn't have user_id - can't verify without user context
      console.warn('[Storage] Cannot verify path without user context:', { objectPath })
      return null
    }
  }
  
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  
  if (!bucket || !key) {
    console.warn('[Storage] Invalid path format for signing:', { objectPath, bucket, key })
    return null
  }
  
  // Check if file exists before attempting to sign
  const exists = await checkFileExists(objectPath, userId, userSupabase)
  if (!exists) {
    console.warn('[Storage] File does not exist, cannot sign URL:', objectPath)
    return null
  }
  
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expiresIn)
  
  if (error) {
    // Distinguish between missing files and permission errors
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      console.warn('[Storage] File not found when signing URL:', objectPath)
      return null
    }
    console.error('[Storage] Error signing URL:', { objectPath, error: error.message })
    return null
  }
  
  if (!data?.signedUrl) {
    console.warn('[Storage] No signed URL returned for:', objectPath)
    return null
  }
  
  return data.signedUrl
}

/** Download remote image and upload to outputs bucket; return objectPath "outputs/<key>" and thumbnail */
export async function fetchAndSaveToOutputs(remoteUrl: string, userId: string) {
  const supabase = supabaseAdmin
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error('Fetch output failed')
  const buf = Buffer.from(await res.arrayBuffer())
  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const objectPath = `outputs/${key}`
  
  // Upload full resolution image
  const { error } = await supabase.storage.from('outputs').upload(key, buf, {
    contentType: 'image/jpeg',
    upsert: false
  })
  if (error) throw new Error('Upload to outputs failed')
  
  // Generate and upload thumbnail
  let thumbnailPath: string | undefined
  try {
    const thumbnailResult = await createAndUploadThumbnail(remoteUrl, userId, objectPath)
    thumbnailPath = thumbnailResult.thumbnailPath
  } catch (thumbnailError) {
    console.error('[Storage] Failed to generate thumbnail, continuing without it:', thumbnailError)
    // Don't fail the entire operation if thumbnail generation fails
  }
  
  return { 
    bucket: 'outputs', 
    objectKey: key, 
    objectPath,
    thumbnailPath 
  }
}

/** Delete a single file from storage bucket */
export async function deleteStorageFile(objectPath: string): Promise<boolean> {
  if (!objectPath) return false
  
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  
  if (!bucket || !key) return false
  
  const { error } = await supabase.storage.from(bucket).remove([key])
  if (error) {
    console.error(`Failed to delete storage file ${objectPath}:`, error)
    return false
  }
  return true
}

/** Delete multiple files from storage buckets */
export async function deleteStorageFiles(objectPaths: string[]): Promise<{ deleted: number; failed: number }> {
  if (!objectPaths.length) return { deleted: 0, failed: 0 }
  
  const supabase = supabaseAdmin
  const bucketGroups = new Map<string, string[]>()
  
  // Group files by bucket
  for (const objectPath of objectPaths) {
    if (!objectPath) continue
    const [bucket, ...rest] = objectPath.split('/')
    const key = rest.join('/')
    
    if (!bucket || !key) continue
    
    if (!bucketGroups.has(bucket)) {
      bucketGroups.set(bucket, [])
    }
    bucketGroups.get(bucket)!.push(key)
  }
  
  let deleted = 0
  let failed = 0
  
  // Delete files from each bucket
  for (const [bucket, keys] of bucketGroups) {
    const { error } = await supabase.storage.from(bucket).remove(keys)
    if (error) {
      console.error(`Failed to delete files from bucket ${bucket}:`, error)
      failed += keys.length
    } else {
      deleted += keys.length
    }
  }
  
  return { deleted, failed }
}
