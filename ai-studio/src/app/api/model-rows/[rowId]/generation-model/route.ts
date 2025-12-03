import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { getWaveSpeedModel, DEFAULT_MODEL_ID } from '@/lib/wavespeed-models'
import { isAdminUser } from '@/lib/admin'

/**
 * PATCH /api/model-rows/[rowId]/generation-model
 * Update the generation_model for a model row
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
      .from('model_rows')
      .select('id, model_id, created_by')
      .eq('id', rowId)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Model row not found' 
      }, { status: 404 })
    }

    // Check access: user must own the row or be admin
    const isAdmin = await isAdminUser()
    const hasAccess = isAdmin || row.created_by === user.id

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied' 
      }, { status: 403 })
    }

    // Update the generation_model
    const { data: updatedRow, error: updateError } = await supabase
      .from('model_rows')
      .update({ generation_model })
      .eq('id', rowId)
      .select()
      .single()

    if (updateError) {
      console.error('[ModelRowGenerationModel] Update error:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update generation model' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      row: updatedRow
    })

  } catch (error) {
    console.error('[ModelRowGenerationModel] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

