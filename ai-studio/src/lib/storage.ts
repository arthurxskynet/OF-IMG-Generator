import { supabaseAdmin } from '@/lib/supabase-admin'
import { createAndUploadThumbnail } from './thumbnail-generator'

/** objectPath is "bucket/objectKey" */
export async function signPath(objectPath: string, expiresIn = 14400): Promise<string> {
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expiresIn)
  if (error || !data?.signedUrl) throw new Error('Cannot sign URL')
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
