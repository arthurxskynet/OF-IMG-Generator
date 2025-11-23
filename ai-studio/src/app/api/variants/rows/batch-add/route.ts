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
    const body: BatchAddImagesRequest & { model_id?: string } = await req.json()
    const { images, model_id } = body

    if (!images || images.length === 0) {
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // If model_id is provided, validate it exists and user has access
    if (model_id) {
      const { data: model, error: modelError } = await supabase
        .from('models')
        .select('id, owner_id, team_id')
        .eq('id', model_id)
        .single()

      if (modelError || !model) {
        return NextResponse.json({ 
          error: 'Model not found' 
        }, { status: 404 })
      }

      // Check if user has access to the model
      let hasAccess = model.owner_id === user.id

      if (!hasAccess && model.team_id) {
        // Check if user is a team member
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', model.team_id)
          .eq('user_id', user.id)
          .single()
        
        if (teamMember) {
          hasAccess = true
        } else {
          // Check if user owns the team
          const { data: team } = await supabase
            .from('teams')
            .select('owner_id')
            .eq('id', model.team_id)
            .single()
          
          hasAccess = team?.owner_id === user.id
        }
      }

      if (!hasAccess) {
        return NextResponse.json({ 
          error: 'Access denied to model' 
        }, { status: 403 })
      }
    }

    // Get user's team_id (use model's team_id if available)
    let teamId = user.id
    if (model_id) {
      const { data: model } = await supabase
        .from('models')
        .select('team_id')
        .eq('id', model_id)
        .single()
      if (model?.team_id) {
        teamId = model.team_id
      }
    }

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
      // Create variant row with model_id if provided
      const insertData = {
        user_id: user.id,
        team_id: teamId,
        model_id: model_id || null,
        name: sourceRowId ? `From Row ${sourceRowId.slice(0, 8)}` : 'Variant Row'
      }
      
      console.log('[BatchAdd] Creating variant row:', {
        model_id: insertData.model_id,
        user_id: insertData.user_id,
        team_id: insertData.team_id
      })
      
      const { data: row, error: rowError } = await supabase
        .from('variant_rows')
        .insert(insertData)
        .select()
        .single()

      if (rowError || !row) {
        console.error('[BatchAdd] Failed to create row:', rowError)
        console.error('[BatchAdd] Insert data was:', insertData)
        continue
      }
      
      console.log('[BatchAdd] Successfully created variant row:', {
        rowId: row.id,
        model_id: row.model_id,
        expected_model_id: model_id
      })

      // Insert images for this row - explicitly mark as reference images (not generated)
      // Validation: All images added via batch-add are reference images
      const imagesToInsert = groupImages.map((img, index) => {
        const insertData = {
          variant_row_id: row.id,
          output_path: img.outputPath,
          thumbnail_path: img.thumbnailPath,
          source_row_id: img.sourceRowId,
          position: index,
          is_generated: false as const // Explicitly mark as reference image (never null/undefined)
        }
        
        // Defensive validation
        if (insertData.is_generated !== false) {
          console.error('[BatchAdd] CRITICAL: Reference image has incorrect is_generated flag', {
            rowId: row.id,
            index,
            isGenerated: insertData.is_generated
          })
          throw new Error('Reference images must have is_generated=false')
        }
        
        return insertData
      })

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

