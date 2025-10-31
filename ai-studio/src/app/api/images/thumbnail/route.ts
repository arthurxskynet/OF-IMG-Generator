import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateThumbnailFromStorage } from '@/lib/thumbnail-generator'
import { signPath } from '@/lib/storage'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const imageId = searchParams.get('imageId')
    
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }
    
    // Get image details
    const { data: image, error: fetchError } = await supabaseAdmin
      .from('generated_images')
      .select('id, output_url, thumbnail_url, user_id')
      .eq('id', imageId)
      .single()
    
    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    
    // If thumbnail already exists, return signed URL
    if (image.thumbnail_url) {
      try {
        const signedUrl = await signPath(image.thumbnail_url, 3600) // 1 hour expiry
        return NextResponse.json({ url: signedUrl })
      } catch (error) {
        console.error('Failed to sign existing thumbnail URL:', error)
        // Fall through to generate new thumbnail
      }
    }
    
    // Generate thumbnail on-demand
    try {
      console.log(`Generating thumbnail on-demand for image ${imageId}`)
      
      const thumbnailPath = await generateThumbnailFromStorage(
        image.output_url,
        image.user_id
      )
      
      // Update database with thumbnail URL
      const { error: updateError } = await supabaseAdmin
        .from('generated_images')
        .update({ thumbnail_url: thumbnailPath })
        .eq('id', imageId)
      
      if (updateError) {
        console.error('Failed to update thumbnail URL:', updateError)
        // Continue anyway - we can still return the signed URL
      }
      
      // Return signed URL for the generated thumbnail
      const signedUrl = await signPath(thumbnailPath, 3600)
      return NextResponse.json({ url: signedUrl })
      
    } catch (error) {
      console.error(`Failed to generate thumbnail for image ${imageId}:`, error)
      
      // Fallback to full resolution image
      try {
        const fallbackUrl = await signPath(image.output_url, 3600)
        return NextResponse.json({ 
          url: fallbackUrl,
          fallback: true,
          message: 'Using full resolution image as thumbnail generation failed'
        })
      } catch (fallbackError) {
        return NextResponse.json(
          { error: 'Failed to generate thumbnail and fallback failed' },
          { status: 500 }
        )
      }
    }
    
  } catch (error) {
    console.error('Thumbnail API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

