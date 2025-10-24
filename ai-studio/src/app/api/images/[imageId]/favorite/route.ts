import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

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

    // First, let's check if the image exists and get its current state
    const { data: existingImage, error: fetchError } = await supabase
      .from('generated_images')
      .select('id, is_favorited, user_id')
      .eq('id', imageId)
      .single()

    if (fetchError) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }

    if (existingImage.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Update the favorite status for the image
    const { data, error } = await supabase
      .from('generated_images')
      .update({ is_favorited })
      .eq('id', imageId)
      .eq('user_id', user.id) // Ensure user can only update their own images
      .select('id, is_favorited')
      .single()

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
