import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

/**
 * DELETE /api/variants/rows/[rowId]/images/[imageId] - Delete an image from a variant row
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ rowId: string; imageId: string }> }
) {
  const { rowId, imageId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Verify row access
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select('id, user_id, model_id')
      .eq('id', rowId)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    // Check access: if model_id is set, verify model access; otherwise check user_id
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
      if (row.model_id) {
        const { data: model, error: modelError } = await supabase
          .from('models')
          .select('id, owner_id, team_id')
          .eq('id', row.model_id)
          .single()

        if (modelError || !model) {
          return NextResponse.json({ 
            error: 'Model not found' 
          }, { status: 404 })
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
        hasAccess = row.user_id === user.id
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied to variant row' 
      }, { status: 403 })
    }

    // Delete the image
    const { error } = await supabase
      .from('variant_row_images')
      .delete()
      .eq('id', imageId)
      .eq('variant_row_id', rowId)

    if (error) {
      console.error('[VariantRowImage] Failed to delete image:', error)
      return NextResponse.json({ 
        error: 'Failed to delete image' 
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[VariantRowImage] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

