import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

interface ImageInsertData {
  variant_row_id: string
  output_path: string
  thumbnail_path: string | null
  source_row_id: string | null
  position: number
  is_generated: false
}

/**
 * POST /api/variants/rows/[rowId]/images - Add images to a variant row
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { images } = body

    if (!images || images.length === 0) {
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Verify row ownership
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select('id')
      .eq('id', rowId)
      .eq('user_id', user.id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    // Get current max position
    const { data: existingImages } = await supabase
      .from('variant_row_images')
      .select('position')
      .eq('variant_row_id', rowId)
      .order('position', { ascending: false })
      .limit(1)

    const startPosition = existingImages && existingImages.length > 0 
      ? existingImages[0].position + 1 
      : 0

    // Insert images - explicitly mark as reference images (not generated)
    // Validation: All images added via this endpoint are reference images
    const imagesToInsert: ImageInsertData[] = images.map((img: any, index: number) => {
      const insertData: ImageInsertData = {
        variant_row_id: rowId,
        output_path: img.outputPath,
        thumbnail_path: img.thumbnailPath || null,
        source_row_id: img.sourceRowId || null,
        position: startPosition + index,
        is_generated: false as const // Explicitly mark as reference image (never null/undefined)
      }
      
      // Defensive validation
      if (insertData.is_generated !== false) {
        console.error('[VariantRowImages] CRITICAL: Reference image has incorrect is_generated flag', {
          rowId,
          index,
          isGenerated: insertData.is_generated
        })
        throw new Error('Reference images must have is_generated=false')
      }
      
      return insertData
    })
    
    console.log('[VariantRowImages] Inserting reference images', {
      rowId,
      count: imagesToInsert.length,
      validatedFlags: imagesToInsert.map((img) => ({ position: img.position, is_generated: img.is_generated }))
    })

    const { data: insertedImages, error: insertError } = await supabase
      .from('variant_row_images')
      .insert(imagesToInsert)
      .select()

    if (insertError) {
      console.error('[VariantRowImages] Failed to insert images:', insertError)
      return NextResponse.json({ 
        error: 'Failed to add images' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      images: insertedImages,
      count: insertedImages?.length || 0
    })

  } catch (error) {
    console.error('[VariantRowImages] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

