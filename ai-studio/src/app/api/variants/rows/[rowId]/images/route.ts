import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

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
    console.error('[VariantRowImages] Unauthorized request - no user found', { rowId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { images } = body

    console.log('[VariantRowImages] Request received', {
      userId: user.id,
      rowId,
      imageCount: images?.length || 0
    })

    if (!images || images.length === 0) {
      console.error('[VariantRowImages] No images provided', { userId: user.id, rowId })
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Verify row access - check model access if model_id is set, otherwise check user_id
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select('id, user_id, model_id')
      .eq('id', rowId)
      .single()

    if (rowError || !row) {
      console.error('[VariantRowImages] Row not found:', { rowId, error: rowError })
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    // Check if user is admin (admins have access to all variant rows)
    const isAdmin = await isAdminUser()

    // Check access: if model_id is set, verify model access; otherwise check user_id
    let hasAccess = isAdmin

    if (!hasAccess) {
      if (row.model_id) {
        // Check model access (same logic as batch-add endpoint)
        const { data: model, error: modelError } = await supabase
          .from('models')
          .select('id, owner_id, team_id')
          .eq('id', row.model_id)
          .single()

        if (modelError || !model) {
          console.error('[VariantRowImages] Model not found:', { modelId: row.model_id, error: modelError })
          return NextResponse.json({ 
            error: 'Model not found' 
          }, { status: 404 })
        }

        // Logic matches RLS policy: admin OR (team_id IS NULL AND owner) OR team_member OR team_owner
        // Also allow model owner regardless of team_id (consistent with models table policy)
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
      } else {
        // Backward compatibility: check user_id when model_id is null
        hasAccess = row.user_id === user.id
      }
    }

    if (!hasAccess) {
      console.error('[VariantRowImages] Access denied:', { 
        rowId, 
        userId: user.id, 
        rowUserId: row.user_id, 
        modelId: row.model_id 
      })
      return NextResponse.json({ 
        error: 'Access denied to variant row' 
      }, { status: 403 })
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
      console.error('[VariantRowImages] Failed to insert images', {
        userId: user.id,
        rowId,
        modelId: row.model_id,
        imageCount: imagesToInsert.length,
        error: insertError
      })
      return NextResponse.json({ 
        error: 'Failed to add images' 
      }, { status: 500 })
    }

    console.log('[VariantRowImages] Successfully inserted images', {
      userId: user.id,
      rowId,
      modelId: row.model_id,
      imageCount: insertedImages?.length || 0
    })

    return NextResponse.json({ 
      images: insertedImages,
      count: insertedImages?.length || 0
    })

  } catch (error) {
    console.error('[VariantRowImages] Error', {
      userId: user.id,
      rowId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

