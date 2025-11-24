import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { BatchAddImagesRequest, BatchAddImagesResponse } from '@/types/variants'
import { isAdminUser } from '@/lib/admin'

/**
 * POST /api/variants/rows/batch-add
 * Group images by sourceRowId and create one variant row per group
 */
export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    console.error('[BatchAdd] Unauthorized request - no user found')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let model_id: string | undefined
  try {
    const body: BatchAddImagesRequest & { model_id?: string } = await req.json()
    const { images } = body
    model_id = body.model_id

    console.log('[BatchAdd] Request received', {
      userId: user.id,
      modelId: model_id,
      imageCount: images?.length || 0
    })

    if (!images || images.length === 0) {
      console.error('[BatchAdd] No images provided', { userId: user.id, modelId: model_id })
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Check if user is admin (admins have access to all models)
    const isAdmin = await isAdminUser()

    // If model_id is provided, validate it exists and user has access
    if (model_id) {
      const { data: model, error: modelError } = await supabase
        .from('models')
        .select('id, owner_id, team_id')
        .eq('id', model_id)
        .single()

      if (modelError || !model) {
        console.error('[BatchAdd] Model not found', { 
          userId: user.id, 
          modelId: model_id, 
          error: modelError 
        })
        return NextResponse.json({ 
          error: 'Model not found' 
        }, { status: 404 })
      }

      // Check if user has access to the model
      // Logic matches RLS policy: admin OR (team_id IS NULL AND owner) OR team_member OR team_owner
      let hasAccess = isAdmin

      if (!hasAccess) {
        // If team_id is NULL, user must be the owner
        if (model.team_id === null) {
          hasAccess = model.owner_id === user.id
        } else {
          // If team_id is set, check: owner OR team member OR team owner
          hasAccess = model.owner_id === user.id

          if (!hasAccess) {
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
        }
      }

      if (!hasAccess) {
        console.error('[BatchAdd] Access denied to model', {
          userId: user.id,
          isAdmin,
          modelId: model_id,
          modelOwnerId: model.owner_id,
          modelTeamId: model.team_id
        })
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
        console.error('[BatchAdd] Failed to create row', {
          userId: user.id,
          modelId: model_id,
          sourceRowId,
          error: rowError,
          insertData
        })
        continue
      }
      
      console.log('[BatchAdd] Successfully created variant row', {
        userId: user.id,
        rowId: row.id,
        modelId: row.model_id,
        expectedModelId: model_id,
        teamId: row.team_id
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
        console.error('[BatchAdd] Failed to insert images', {
          userId: user.id,
          rowId: row.id,
          modelId: model_id,
          imageCount: imagesToInsert.length,
          error: imagesError
        })
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

    console.log('[BatchAdd] Success', {
      userId: user.id,
      modelId: model_id,
      rowsCreated: response.rowsCreated,
      imagesAdded: response.imagesAdded
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('[BatchAdd] Error', {
      userId: user.id,
      modelId: model_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

