import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath, checkFileExists, verifyStorageOwnership } from '@/lib/storage'
import { isAdminUser } from '@/lib/admin'

const ALLOWED_BUCKETS = ['outputs', 'refs', 'targets', 'thumbnails', 'avatars']

export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    console.error('[StorageSign] Unauthorized request - no user found')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const path = req.nextUrl.searchParams.get('path')
  if (!path) {
    console.error('[StorageSign] Missing path parameter', { userId: user.id })
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  // Validate path format: should be "bucket/key" or "bucket/subpath/key"
  const pathParts = path.split('/')
  if (pathParts.length < 2) {
    console.error('[StorageSign] Invalid path format', { userId: user.id, path })
    return NextResponse.json({ error: 'Invalid path format. Expected: bucket/key' }, { status: 400 })
  }

  const bucket = pathParts[0]
  const key = pathParts.slice(1).join('/')

  if (!bucket || !key) {
    console.error('[StorageSign] Invalid path - missing bucket or key', { userId: user.id, path, bucket, key })
    return NextResponse.json({ error: 'Invalid path - missing bucket or key' }, { status: 400 })
  }

  // Validate bucket is allowed
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    console.error('[StorageSign] Invalid bucket', { userId: user.id, bucket, allowedBuckets: ALLOWED_BUCKETS })
    return NextResponse.json({ error: `Invalid bucket. Allowed buckets: ${ALLOWED_BUCKETS.join(', ')}` }, { status: 400 })
  }

  // Validate path format matches expected bucket/key pattern
  if (!/^(outputs|refs|targets|thumbnails|avatars)\/.+$/i.test(path)) {
    console.error('[StorageSign] Invalid path format', { userId: user.id, path, bucket, key })
    return NextResponse.json({ error: 'Invalid path format. Expected: bucket/key' }, { status: 400 })
  }

  // Verify user ownership (or admin access) before signing
  const isAdmin = await isAdminUser()
  const hasAccess = await verifyStorageOwnership(path, user.id, supabase, isAdmin)
  
  if (!hasAccess) {
    console.warn('[StorageSign] Access denied - user does not own file', { userId: user.id, path, bucket, key })
    return NextResponse.json({ 
      error: 'Access denied' 
    }, { status: 403 })
  }

  // Check if file exists before attempting to sign
  const fileExists = await checkFileExists(path, user.id, supabase)
  if (!fileExists) {
    console.warn('[StorageSign] File does not exist', { userId: user.id, path, bucket, key })
    return NextResponse.json({ 
      error: 'File not found' 
    }, { status: 404 })
  }

  try {
    console.log('[StorageSign] Signing path', { userId: user.id, bucket, keyLength: key.length })
    const url = await signPath(path, 14400, user.id, supabase) // 4 hours
    
    // signPath now returns null for missing files instead of throwing
    if (!url) {
      console.warn('[StorageSign] Failed to sign URL (file may not exist)', { userId: user.id, path, bucket, key })
      return NextResponse.json({ 
        error: 'File not found' 
      }, { status: 404 })
    }
    
    const response = NextResponse.json({ url })
    
    // Add aggressive cache headers to reduce repeated requests
    // Cache for 1 hour, serve stale for 2 hours while revalidating
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200, s-maxage=3600')
    
    return response
  } catch (error) {
    // Only log unexpected errors (not missing files, which are handled above)
    console.error('[StorageSign] Unexpected error signing path', { 
      userId: user.id, 
      path, 
      bucket, 
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: error instanceof Error ? `Failed to sign URL: ${error.message}` : 'Failed to sign URL' 
    }, { status: 500 })
  }
}
