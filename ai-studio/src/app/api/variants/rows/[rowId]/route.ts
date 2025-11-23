import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

/**
 * GET /api/variants/rows/[rowId] - Get a single variant row with images
 */
export async function GET(
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
    // Fetch the variant row
    const { data: row, error } = await supabase
      .from('variant_rows')
      .select('*')
      .eq('id', rowId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('[VariantRow] Failed to fetch row:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch variant row' 
      }, { status: 500 })
    }

    if (!row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    // Fetch images for this row
    const { data: images, error: imagesError } = await supabase
      .from('variant_row_images')
      .select('*')
      .eq('variant_row_id', rowId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false, nullsFirst: false })

    if (imagesError) {
      console.error('[VariantRow] Failed to fetch images:', imagesError)
    }

    // Attach images to row
    const rowWithImages = {
      ...row,
      variant_row_images: images || []
    }

    // Fetch jobs for status tracking
    const { data: jobs } = await supabase
      .from('jobs')
      .select(`
        id,
        row_id,
        variant_row_id,
        status,
        created_at
      `)
      .eq('variant_row_id', rowId)
      .order('created_at', { ascending: false })

    if (jobs) {
      (rowWithImages as any).jobs = jobs
    }

    return NextResponse.json({ row: rowWithImages })

  } catch (error) {
    console.error('[VariantRow] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * PATCH /api/variants/rows/[rowId] - Update variant row (name, prompt)
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
    const body = await req.json()
    const { name, prompt, output_width, output_height, match_target_ratio } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (prompt !== undefined) updateData.prompt = prompt
    if (output_width !== undefined) {
      // Validate width is within valid range (1024-4096)
      if (output_width < 1024 || output_width > 4096) {
        return NextResponse.json({ 
          error: 'output_width must be between 1024 and 4096' 
        }, { status: 400 })
      }
      updateData.output_width = output_width
    }
    if (output_height !== undefined) {
      // Validate height is within valid range (1024-4096)
      if (output_height < 1024 || output_height > 4096) {
        return NextResponse.json({ 
          error: 'output_height must be between 1024 and 4096' 
        }, { status: 400 })
      }
      updateData.output_height = output_height
    }
    if (match_target_ratio !== undefined) {
      updateData.match_target_ratio = Boolean(match_target_ratio)
    }

    const { data: row, error } = await supabase
      .from('variant_rows')
      .update(updateData)
      .eq('id', rowId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[VariantRow] Failed to update row:', error)
      return NextResponse.json({ 
        error: 'Failed to update variant row' 
      }, { status: 500 })
    }

    if (!row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    return NextResponse.json({ row })

  } catch (error) {
    console.error('[VariantRow] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * DELETE /api/variants/rows/[rowId] - Delete variant row
 */
export async function DELETE(
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
    const { error } = await supabase
      .from('variant_rows')
      .delete()
      .eq('id', rowId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[VariantRow] Failed to delete row:', error)
      return NextResponse.json({ 
        error: 'Failed to delete variant row' 
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[VariantRow] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

