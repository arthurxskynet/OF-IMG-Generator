import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateThumbnailFromStorage } from '@/lib/thumbnail-generator'
import { signPath } from '@/lib/storage'
import { createServer } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServer()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(req.url)
    const imageId = searchParams.get('imageId')
    
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }
    
    // Get image details - use regular client so RLS applies
    const { data: image, error: fetchError } = await supabase
      .from('generated_images')
      .select('id, output_url, thumbnail_url, user_id, team_id')
      .eq('id', imageId)
      .single()
    
    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    
    // Verify user ownership (or admin access)
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin
    
    if (!hasAccess) {
      // Check if user owns the image
      hasAccess = image.user_id === user.id
      
      // If not owner, check team membership
      if (!hasAccess && image.team_id) {
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', image.team_id)
          .eq('user_id', user.id)
          .single()
        
        if (teamMember) {
          hasAccess = true
        } else {
          // Check if user is team owner
          const { data: team } = await supabase
            .from('teams')
            .select('owner_id')
            .eq('id', image.team_id)
            .single()
          
          hasAccess = team?.owner_id === user.id
        }
      }
    }
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    // If thumbnail already exists, return signed URL
    if (image.thumbnail_url) {
      try {
        const signedUrl = await signPath(image.thumbnail_url, 3600, user.id, supabase) // 1 hour expiry
        if (signedUrl) {
          return NextResponse.json({ url: signedUrl })
        }
        // If signing failed (file doesn't exist), fall through to generate new thumbnail
        console.warn('Thumbnail URL exists in DB but file not found in storage, generating new thumbnail')
      } catch (error) {
        console.error('Failed to sign existing thumbnail URL:', error)
        // Fall through to generate new thumbnail
      }
    }
    
    // Generate thumbnail on-demand
    try {
      console.log(`Generating thumbnail on-demand for image ${imageId}`)
      
      const thumbnailPath = await generateThumbnailFromStorage(
        image.output_url,
        image.user_id
      )
      
      // Update database with thumbnail URL - use admin client for update but we've already verified access
      const { error: updateError } = await supabaseAdmin
        .from('generated_images')
        .update({ thumbnail_url: thumbnailPath })
        .eq('id', imageId)
      
      if (updateError) {
        console.error('Failed to update thumbnail URL:', updateError)
        // Continue anyway - we can still return the signed URL
      }
      
      // Return signed URL for the generated thumbnail
      const signedUrl = await signPath(thumbnailPath, 3600, user.id, supabase)
      if (!signedUrl) {
        throw new Error('Failed to sign generated thumbnail URL')
      }
      return NextResponse.json({ url: signedUrl })
      
    } catch (error) {
      console.error(`Failed to generate thumbnail for image ${imageId}:`, error)
      
      // Fallback to full resolution image
      try {
        const fallbackUrl = await signPath(image.output_url, 3600, user.id, supabase)
        if (!fallbackUrl) {
          return NextResponse.json(
            { error: 'Failed to generate thumbnail and fallback file not found' },
            { status: 404 }
          )
        }
        return NextResponse.json({ 
          url: fallbackUrl,
          fallback: true,
          message: 'Using full resolution image as thumbnail generation failed'
        })
      } catch (fallbackError) {
        return NextResponse.json(
          { error: 'Failed to generate thumbnail and fallback failed' },
          { status: 500 }
        )
      }
    }
    
  } catch (error) {
    console.error('Thumbnail API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

