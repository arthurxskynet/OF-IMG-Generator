import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { deleteStorageFiles } from '@/lib/storage'
import { z } from 'zod'
import { isAdminUser } from '@/lib/admin'

const BatchDeleteSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1, 'At least one image ID is required')
})

interface DeleteResult {
  imageId: string
  success: boolean
  error?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const validatedData = BatchDeleteSchema.parse(body)
    const { imageIds } = validatedData

    // Fetch all images to verify ownership and get storage paths
    const { data: images, error: fetchError } = await supabase
      .from('generated_images')
      .select(`
        id, 
        output_url, 
        user_id, 
        team_id,
        jobs!inner(status)
      `)
      .in('id', imageIds)

    if (fetchError) {
      console.error('Failed to fetch images:', fetchError)
      return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 })
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images found" }, { status: 404 })
    }

    // Check for images from active jobs (prevent deletion of images being generated)
    const activeJobImages = images.filter(img => {
      const job = Array.isArray(img.jobs) ? img.jobs[0] : img.jobs
      return job && ['queued', 'submitted', 'running'].includes(job.status)
    })

    if (activeJobImages.length > 0) {
      return NextResponse.json({ 
        error: "Cannot delete images from active jobs",
        details: `${activeJobImages.length} image(s) are currently being processed and cannot be deleted`
      }, { status: 409 })
    }

    // Check if user is admin (admins can delete all images)
    const isAdmin = await isAdminUser()

    // Verify ownership for all images - check both user ownership, team membership, and admin
    const unauthorizedImages: typeof images = []
    
    if (!isAdmin) {
      for (const img of images) {
        // Check if user owns the image directly
        if (img.user_id === user.id) {
          continue
        }
        
        // Check if user is a team member (if image belongs to a team)
        if (img.team_id) {
          const { data: teamMembership } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', img.team_id)
            .eq('user_id', user.id)
            .single()
          
          if (teamMembership) {
            continue
          }
        }
        
        // If we get here, user doesn't have access
        unauthorizedImages.push(img)
      }
    }

    if (unauthorizedImages.length > 0) {
      return NextResponse.json({ 
        error: "Unauthorized access to some images",
        details: `Cannot delete ${unauthorizedImages.length} image(s) due to insufficient permissions`
      }, { status: 403 })
    }

    // Collect storage paths for deletion
    const storagePaths = images
      .map(img => img.output_url)
      .filter((path): path is string => Boolean(path))

    // Delete storage files first (best effort - don't fail if storage deletion fails)
    const { deleted: filesDeleted, failed: filesFailed } = await deleteStorageFiles(storagePaths)
    
    if (filesFailed > 0) {
      console.warn(`Failed to delete ${filesFailed} storage files, but continuing with database cleanup`)
    }

    // Delete database records
    const { error: deleteError } = await supabase
      .from('generated_images')
      .delete()
      .in('id', imageIds)

    if (deleteError) {
      console.error('Failed to delete image records:', deleteError)
      return NextResponse.json({ 
        error: "Failed to delete image records",
        details: deleteError.message 
      }, { status: 500 })
    }

    // Prepare results
    const results: DeleteResult[] = imageIds.map(imageId => {
      return {
        imageId,
        success: true
      }
    })

    return NextResponse.json({ 
      ok: true, 
      deleted: true,
      results,
      summary: {
        imagesDeleted: images.length,
        filesDeleted,
        filesFailed
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Invalid request data", 
        details: error.issues 
      }, { status: 400 })
    }

    console.error('Batch delete error:', error)
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 })
  }
}
