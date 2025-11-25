import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params
    const { is_favorited } = await req.json()

    if (typeof is_favorited !== 'boolean') {
      return NextResponse.json(
        { error: 'is_favorited must be a boolean' },
        { status: 400 }
      )
    }

    const supabase = await createServer()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check both generated_images and variant_row_images tables
    // First try generated_images
    let existingImage: any = null
    let imageTable: 'generated_images' | 'variant_row_images' | null = null
    
    const { data: genImage, error: genError } = await supabase
      .from('generated_images')
      .select('id, is_favorited, user_id, model_id')
      .eq('id', imageId)
      .single()

    if (!genError && genImage) {
      existingImage = genImage
      imageTable = 'generated_images'
    } else {
      // Try variant_row_images - need to check via variant_rows for user_id
      const { data: variantImage, error: variantError } = await supabase
        .from('variant_row_images')
        .select('id, is_favorited, variant_row_id')
        .eq('id', imageId)
        .single()

      if (!variantError && variantImage) {
        // Check access via variant_rows
        const { data: variantRow, error: rowError } = await supabase
          .from('variant_rows')
          .select('user_id, model_id')
          .eq('id', variantImage.variant_row_id)
          .single()

        if (!rowError && variantRow) {
          existingImage = {
            id: variantImage.id,
            is_favorited: variantImage.is_favorited,
            user_id: variantRow.user_id,
            model_id: variantRow.model_id,
            variant_row_id: variantImage.variant_row_id
          }
          imageTable = 'variant_row_images'
        }
      }
    }

    if (!existingImage || !imageTable) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }

    // Check access: for both generated_images and variant_row_images, check model access
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
      if (imageTable === 'generated_images') {
        // For generated_images, check model access (same as variant_row_images)
        const genImage = existingImage as any
        if (genImage.model_id) {
          const { data: model, error: modelError } = await supabase
            .from('models')
            .select('id, owner_id, team_id')
            .eq('id', genImage.model_id)
            .single()

          if (modelError || !model) {
            return NextResponse.json(
              { error: 'Model not found' },
              { status: 404 }
            )
          }

          if (model.team_id === null) {
            hasAccess = model.owner_id === user.id
          } else {
            hasAccess = model.owner_id === user.id

            if (!hasAccess) {
              const { data: teamMember } = await supabase
                .from('team_members')
                .select('id')
                .eq('team_id', model.team_id)
                .eq('user_id', user.id)
                .single()
              
              if (teamMember) {
                hasAccess = true
              } else {
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
          // Backward compatibility: check user_id if no model_id
          hasAccess = genImage.user_id === user.id
        }
      } else {
        // For variant_row_images, check model access
        const variantImage = existingImage as any
        if (variantImage.model_id) {
          const { data: model, error: modelError } = await supabase
            .from('models')
            .select('id, owner_id, team_id')
            .eq('id', variantImage.model_id)
            .single()

          if (modelError || !model) {
            return NextResponse.json(
              { error: 'Model not found' },
              { status: 404 }
            )
          }

          if (model.team_id === null) {
            hasAccess = model.owner_id === user.id
          } else {
            hasAccess = model.owner_id === user.id

            if (!hasAccess) {
              const { data: teamMember } = await supabase
                .from('team_members')
                .select('id')
                .eq('team_id', model.team_id)
                .eq('user_id', user.id)
                .single()
              
              if (teamMember) {
                hasAccess = true
              } else {
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
          hasAccess = variantImage.user_id === user.id
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Update the favorite status for the image in the appropriate table
    let data: any = null
    let error: any = null

    if (imageTable === 'generated_images') {
      // RLS policies will handle access control, no need to filter by user_id
      const result = await supabase
        .from('generated_images')
        .update({ is_favorited })
        .eq('id', imageId)
        .select('id, is_favorited')
        .single()
      data = result.data
      error = result.error
    } else {
      // For variant_row_images, verify ownership via variant_rows
      const variantRowId = (existingImage as any).variant_row_id
      if (!variantRowId) {
        return NextResponse.json(
          { error: 'Invalid image reference' },
          { status: 400 }
        )
      }

      // Access already checked above, just verify row exists
      const { data: variantRow } = await supabase
        .from('variant_rows')
        .select('id')
        .eq('id', variantRowId)
        .single()

      if (!variantRow) {
        return NextResponse.json(
          { error: 'Variant row not found' },
          { status: 404 }
        )
      }

      const result = await supabase
        .from('variant_row_images')
        .update({ is_favorited })
        .eq('id', imageId)
        .select('id, is_favorited')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Error updating favorite status:', error)
      return NextResponse.json(
        { error: 'Failed to update favorite status' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Image not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      is_favorited: data.is_favorited 
    })

  } catch (error) {
    console.error('Error in favorite toggle:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
