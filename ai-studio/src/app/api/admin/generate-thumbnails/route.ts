import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateThumbnailFromStorage } from '@/lib/thumbnail-generator'

export async function POST(req: NextRequest) {
  try {
    const { batchSize = 10, offset = 0 } = await req.json()
    
    // Fetch images that need thumbnails generated
    const { data: images, error: fetchError } = await supabaseAdmin
      .from('generated_images')
      .select('id, output_url, user_id')
      .is('thumbnail_url', null)
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: true })
    
    if (fetchError) {
      console.error('Failed to fetch images:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 })
    }
    
    if (!images || images.length === 0) {
      return NextResponse.json({ 
        message: 'No images need thumbnails',
        processed: 0,
        failed: 0,
        total: 0
      })
    }
    
    console.log(`Processing ${images.length} images for thumbnail generation`)
    
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    }
    
    // Process each image
    for (const image of images) {
      try {
        console.log(`Generating thumbnail for image ${image.id}`)
        
        // Generate thumbnail from existing storage file
        const thumbnailPath = await generateThumbnailFromStorage(
          image.output_url,
          image.user_id
        )
        
        // Update database with thumbnail URL
        const { error: updateError } = await supabaseAdmin
          .from('generated_images')
          .update({ thumbnail_url: thumbnailPath })
          .eq('id', image.id)
        
        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`)
        }
        
        results.processed++
        console.log(`Successfully generated thumbnail for image ${image.id}`)
        
      } catch (error) {
        console.error(`Failed to generate thumbnail for image ${image.id}:`, error)
        results.failed++
        results.errors.push(`Image ${image.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    // Get total count for progress tracking
    const { count: totalCount } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
      .is('thumbnail_url', null)
    
    return NextResponse.json({
      message: `Processed ${results.processed} images, ${results.failed} failed`,
      processed: results.processed,
      failed: results.failed,
      total: totalCount || 0,
      errors: results.errors.slice(0, 10) // Limit error details
    })
    
  } catch (error) {
    console.error('Thumbnail generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get statistics about thumbnail generation status
    const { count: totalImages } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
    
    const { count: withThumbnails } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
      .not('thumbnail_url', 'is', null)
    
    const { count: withoutThumbnails } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
      .is('thumbnail_url', null)
    
    return NextResponse.json({
      total: totalImages || 0,
      withThumbnails: withThumbnails || 0,
      withoutThumbnails: withoutThumbnails || 0,
      progress: totalImages ? Math.round(((withThumbnails || 0) / totalImages) * 100) : 0
    })
    
  } catch (error) {
    console.error('Failed to get thumbnail stats:', error)
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    )
  }
}

