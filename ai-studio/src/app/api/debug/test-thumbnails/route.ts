import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    // Get some sample images with thumbnails
    const { data: imagesWithThumbnails, error: thumbError } = await supabaseAdmin
      .from('generated_images')
      .select('id, output_url, thumbnail_url, created_at')
      .not('thumbnail_url', 'is', null)
      .limit(5)
    
    // Get some sample images without thumbnails
    const { data: imagesWithoutThumbnails, error: noThumbError } = await supabaseAdmin
      .from('generated_images')
      .select('id, output_url, thumbnail_url, created_at')
      .is('thumbnail_url', null)
      .limit(5)
    
    // Get total counts
    const { count: totalImages } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
    
    const { count: imagesWithThumbs } = await supabaseAdmin
      .from('generated_images')
      .select('*', { count: 'exact', head: true })
      .not('thumbnail_url', 'is', null)
    
    return NextResponse.json({
      totalImages,
      imagesWithThumbs,
      thumbnailCoverage: totalImages ? Math.round((imagesWithThumbs || 0) / totalImages * 100) : 0,
      sampleWithThumbnails: imagesWithThumbnails || [],
      sampleWithoutThumbnails: imagesWithoutThumbnails || [],
      errors: {
        thumbError: thumbError?.message,
        noThumbError: noThumbError?.message
      }
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
