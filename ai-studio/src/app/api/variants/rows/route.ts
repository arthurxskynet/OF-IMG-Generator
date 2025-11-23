import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

/**
 * GET /api/variants/rows - List all variant rows for the current user
 */
export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch variant rows separately from images to avoid nested query limits
    const { data: rows, error } = await supabase
      .from('variant_rows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[VariantRows] Failed to fetch rows:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch variant rows' 
      }, { status: 500 })
    }

    // Fetch all images separately to ensure we get all images
    let allImages: any[] = []
    if (rows && rows.length > 0) {
      const rowIds = rows.map(r => r.id)
      const { data: images, error: imagesError } = await supabase
        .from('variant_row_images')
        .select('*')
        .in('variant_row_id', rowIds)
        .order('position', { ascending: true })
      
      if (!imagesError && images) {
        allImages = images
      }
    }

    // Attach images to their respective rows
    const rowsWithImages = (rows || []).map(row => {
      const rowImages = allImages.filter(img => img.variant_row_id === row.id)
      return {
        ...row,
        variant_row_images: rowImages
      }
    })

    return NextResponse.json({ rows: rowsWithImages })

  } catch (error) {
    console.error('[VariantRows] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * POST /api/variants/rows - Create a new empty variant row
 */
export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { name } = body

    // Get user's team_id (assuming it exists in user metadata or separate query)
    // For now, using user_id as team_id fallback
    const teamId = user.id

    const { data: row, error } = await supabase
      .from('variant_rows')
      .insert({
        user_id: user.id,
        team_id: teamId,
        name: name || null
      })
      .select()
      .single()

    if (error) {
      console.error('[VariantRows] Failed to create row:', error)
      return NextResponse.json({ 
        error: 'Failed to create variant row' 
      }, { status: 500 })
    }

    return NextResponse.json({ row })

  } catch (error) {
    console.error('[VariantRows] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

