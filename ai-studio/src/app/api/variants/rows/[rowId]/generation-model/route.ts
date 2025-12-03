import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { getWaveSpeedModel, DEFAULT_MODEL_ID } from '@/lib/wavespeed-models'
import { isAdminUser } from '@/lib/admin'

/**
 * PATCH /api/variants/rows/[rowId]/generation-model
 * Update the generation_model for a variant row
 */
export async function PATCH(
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
    const { generation_model } = await req.json()

    if (!generation_model) {
      return NextResponse.json({ 
        error: 'generation_model is required' 
      }, { status: 400 })
    }

    // Validate model ID
    try {
      getWaveSpeedModel(generation_model)
    } catch (error) {
      return NextResponse.json({ 
        error: `Invalid generation_model: ${generation_model}` 
      }, { status: 400 })
    }

    // Get the row to check access
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

    // Update the generation_model
    const { data: updatedRow, error: updateError } = await supabase
      .from('variant_rows')
      .update({ generation_model })
      .eq('id', rowId)
      .select()
      .single()

    if (updateError) {
      console.error('[VariantRowGenerationModel] Update error:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update generation model' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      row: updatedRow
    })

  } catch (error) {
    console.error('[VariantRowGenerationModel] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

