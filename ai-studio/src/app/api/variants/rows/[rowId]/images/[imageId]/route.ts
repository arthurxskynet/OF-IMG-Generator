import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

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

