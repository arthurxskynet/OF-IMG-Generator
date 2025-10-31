import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { signPath } from '@/lib/storage'

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now()
    
    // Get a sample of images with thumbnails
    const { data: imagesWithThumbs, error: thumbError } = await supabaseAdmin
      .from('generated_images')
      .select('id, output_url, thumbnail_url')
      .not('thumbnail_url', 'is', null)
      .limit(20)
    
    if (thumbError) {
      return NextResponse.json({ error: thumbError.message }, { status: 500 })
    }
    
    if (!imagesWithThumbs || imagesWithThumbs.length === 0) {
      return NextResponse.json({ 
        message: 'No images with thumbnails found for testing',
        thumbnailCount: 0,
        totalTime: 0
      })
    }
    
    // Test thumbnail URL loading (should be fast)
    const thumbnailStartTime = Date.now()
    const thumbnailPromises = imagesWithThumbs.map(async (img) => {
      try {
        const url = await signPath(img.thumbnail_url!, 14400)
        return { id: img.id, url, success: true }
      } catch (error) {
        return { id: img.id, url: null, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
    
    const thumbnailResults = await Promise.all(thumbnailPromises)
    const thumbnailTime = Date.now() - thumbnailStartTime
    
    // Test full resolution URL loading (should be slower)
    const fullResStartTime = Date.now()
    const fullResPromises = imagesWithThumbs.map(async (img) => {
      try {
        const url = await signPath(img.output_url, 14400)
        return { id: img.id, url, success: true }
      } catch (error) {
        return { id: img.id, url: null, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
    
    const fullResResults = await Promise.all(fullResPromises)
    const fullResTime = Date.now() - fullResStartTime
    
    const totalTime = Date.now() - startTime
    
    const thumbnailSuccesses = thumbnailResults.filter(r => r.success).length
    const fullResSuccesses = fullResResults.filter(r => r.success).length
    
    return NextResponse.json({
      testResults: {
        thumbnailCount: imagesWithThumbs.length,
        thumbnailLoading: {
          time: thumbnailTime,
          averagePerImage: Math.round(thumbnailTime / imagesWithThumbs.length),
          successes: thumbnailSuccesses,
          failures: imagesWithThumbs.length - thumbnailSuccesses
        },
        fullResLoading: {
          time: fullResTime,
          averagePerImage: Math.round(fullResTime / imagesWithThumbs.length),
          successes: fullResSuccesses,
          failures: imagesWithThumbs.length - fullResSuccesses
        },
        totalTime,
        performanceImprovement: fullResTime > 0 ? Math.round((1 - thumbnailTime / fullResTime) * 100) : 0
      },
      sampleThumbnailResults: thumbnailResults.slice(0, 3),
      sampleFullResResults: fullResResults.slice(0, 3)
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
