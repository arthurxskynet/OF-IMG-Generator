import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { signPath, verifyStorageOwnership } from '@/lib/storage'
import { isAdminUser } from '@/lib/admin'

export const runtime = 'nodejs'

interface CloneBody {
  sourcePath: string
  destBucket?: 'targets' | 'refs'
}

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('[clone] Unauthorized request - no user found')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as CloneBody
    const sourcePath = String(body?.sourcePath || '').trim()
    const destBucket = (body?.destBucket || 'targets') as 'targets' | 'refs'
    
    console.log(`[clone] Request from user ${user.id}: ${sourcePath} -> ${destBucket}/`)
    
    if (!/^(outputs|refs|targets|thumbnails)\/.+/.test(sourcePath)) {
      console.error(`[clone] Invalid sourcePath: ${sourcePath}`)
      return NextResponse.json({ error: 'Invalid sourcePath' }, { status: 400 })
    }

    // Verify user owns the source file (or is admin)
    const isAdmin = await isAdminUser()
    const hasAccess = await verifyStorageOwnership(sourcePath, user.id, supabase, isAdmin)
    
    if (!hasAccess) {
      console.warn(`[clone] Access denied - user does not own source file:`, { sourcePath, userId: user.id })
      return NextResponse.json({ error: 'Access denied to source file' }, { status: 403 })
    }

    console.log(`[clone] Signing path: ${sourcePath}`)
    const signed = await signPath(sourcePath, 300, user.id, supabase)
    
    if (!signed) {
      console.error(`[clone] Failed to sign source path: ${sourcePath}`)
      return NextResponse.json({ error: 'Source file not found or cannot be accessed' }, { status: 404 })
    }
    
    console.log(`[clone] Fetching from signed URL`)
    const res = await fetch(signed)
    if (!res.ok) {
      console.error(`[clone] Failed to fetch source: ${res.status} ${res.statusText}`)
      return NextResponse.json({ error: 'Failed to fetch source image' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const arrayBuffer = await res.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    const key = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    console.log(`[clone] Uploading to ${destBucket}/${key}`)
    
    const { error: uploadError } = await supabaseAdmin.storage.from(destBucket).upload(key, bytes, {
      contentType,
      upsert: false
    })
    if (uploadError) {
      console.error(`[clone] Upload error:`, uploadError)
      return NextResponse.json({ error: 'Failed to upload to destination', details: uploadError.message }, { status: 500 })
    }

    const objectPath = `${destBucket}/${key}`
    console.log(`[clone] Successfully cloned to: ${objectPath}`)
    
    return NextResponse.json({ objectPath }, { 
      headers: { 'Cache-Control': 'no-store' } 
    })
  } catch (error) {
    console.error('[clone] Internal error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}


