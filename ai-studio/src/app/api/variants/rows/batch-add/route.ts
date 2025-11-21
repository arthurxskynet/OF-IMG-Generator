import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { BatchAddImagesRequest, BatchAddImagesResponse } from '@/types/variants'

/**
 * POST /api/variants/rows/batch-add
 * Group images by sourceRowId and create one variant row per group
 */
export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: BatchAddImagesRequest = await req.json()
    const { images } = body

    if (!images || images.length === 0) {
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Get user's team_id
    const teamId = user.id

    // Group images by sourceRowId
    const imageGroups = new Map<string | null, typeof images>()
    for (const image of images) {
      const key = image.sourceRowId || null
      if (!imageGroups.has(key)) {
        imageGroups.set(key, [])
      }
      imageGroups.get(key)!.push(image)
    }

    console.log('[BatchAdd] Grouped images:', {
      totalImages: images.length,
      groups: imageGroups.size,
      groupKeys: Array.from(imageGroups.keys())
    })

    const createdRows = []
    let totalImagesAdded = 0

    // Create one variant row per group
    for (const [sourceRowId, groupImages] of imageGroups) {
      // Create variant row
      const { data: row, error: rowError } = await supabase
        .from('variant_rows')
        .insert({
          user_id: user.id,
          team_id: teamId,
          name: sourceRowId ? `From Row ${sourceRowId.slice(0, 8)}` : 'Variant Row'
        })
        .select()
        .single()

      if (rowError || !row) {
        console.error('[BatchAdd] Failed to create row:', rowError)
        continue
      }

      // Insert images for this row
      const imagesToInsert = groupImages.map((img, index) => ({
        variant_row_id: row.id,
        output_path: img.outputPath,
        thumbnail_path: img.thumbnailPath,
        source_row_id: img.sourceRowId,
        position: index
      }))

      const { data: insertedImages, error: imagesError } = await supabase
        .from('variant_row_images')
        .insert(imagesToInsert)
        .select()

      if (imagesError) {
        console.error('[BatchAdd] Failed to insert images:', imagesError)
        // Row was created but images failed - continue anyway
      }

      createdRows.push({
        id: row.id,
        imageCount: insertedImages?.length || 0,
        sourceRowId: sourceRowId
      })

      totalImagesAdded += insertedImages?.length || 0
    }

    const response: BatchAddImagesResponse = {
      rowsCreated: createdRows.length,
      imagesAdded: totalImagesAdded,
      rows: createdRows
    }

    console.log('[BatchAdd] Success:', response)

    return NextResponse.json(response)

  } catch (error) {
    console.error('[BatchAdd] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

