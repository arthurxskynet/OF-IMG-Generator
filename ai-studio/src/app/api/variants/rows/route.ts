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
    // Get optional model_id filter from query params
    const { searchParams } = new URL(req.url)
    const modelIdFilter = searchParams.get('model_id')

    // Build query with optional model_id filter
    let query = supabase
      .from('variant_rows')
      .select(`
        *,
        model:models(id, name)
      `)
    
    // Apply filters - RLS will handle access control, but we can add explicit filters
    if (modelIdFilter) {
      query = query.eq('model_id', modelIdFilter)
    } else {
      // If no model_id filter, show all variants user has access to (via RLS)
      // This includes variants with model_id (if user has model access) and variants without model_id (user's own)
    }

    const { data: rows, error } = await query.order('created_at', { ascending: false })

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
    const { name, model_id } = body

    // Get user's team_id (assuming it exists in user metadata or separate query)
    // For now, using user_id as team_id fallback
    const teamId = user.id

    // If model_id is provided, validate it exists and user has access
    if (model_id) {
      const { data: model, error: modelError } = await supabase
        .from('models')
        .select('id, owner_id, team_id')
        .eq('id', model_id)
        .single()

      if (modelError || !model) {
        return NextResponse.json({ 
          error: 'Model not found' 
        }, { status: 404 })
      }

      // Check if user has access to the model
      // User owns the model, or is team member, or is team owner
      let hasAccess = model.owner_id === user.id

      if (!hasAccess && model.team_id) {
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

      if (!hasAccess) {
        return NextResponse.json({ 
          error: 'Access denied to model' 
        }, { status: 403 })
      }

      // Use model's team_id if available, otherwise use user_id
      if (model.team_id) {
        const teamIdFromModel = model.team_id
      }
    }

    const { data: row, error } = await supabase
      .from('variant_rows')
      .insert({
        user_id: user.id,
        team_id: teamId,
        name: name || null,
        model_id: model_id || null
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

