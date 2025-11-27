import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { generateVariantPromptWithGrok } from '@/lib/ai-prompt-generator'
import { isAdminUser } from '@/lib/admin'

export async function POST(
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
    // Get variant row with images
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select(`
        *,
        variant_row_images (
          output_path,
          thumbnail_path,
          position,
          is_generated
        )
      `)
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

    const images = (row as any).variant_row_images || []
    if (images.length === 0) {
      return NextResponse.json({ 
        error: 'No images in this variant row' 
      }, { status: 400 })
    }

    // Sort by position and filter to only reference images (is_generated !== true)
    const sortedImages = images.sort((a: any, b: any) => a.position - b.position)
    const referenceImages = sortedImages.filter((img: any) => img.is_generated !== true)
    
    if (referenceImages.length === 0) {
      return NextResponse.json({ 
        error: 'No reference images found in this variant row. Add reference images first.' 
      }, { status: 400 })
    }
    
    const imagePaths = referenceImages.map((img: any) => img.output_path)

    // Sign URLs for the images
    const signed = await Promise.all(
      imagePaths.map((path: string) => signPath(path, 600))
    )
    const signedUrls = signed.filter((url): url is string => url !== null)
    
    if (signedUrls.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to sign image URLs' 
      }, { status: 400 })
    }

    console.log('[VariantRowPrompt] Generating with Grok', {
      rowId,
      referenceImagesCount: referenceImages.length,
      imagesCount: signedUrls.length,
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Generate variant prompt (with adaptive sampling)
    const generatedPrompt = await generateVariantPromptWithGrok(signedUrls)

    // Save prompt to row (RLS will enforce access)
    const { error: updateError } = await supabase
      .from('variant_rows')
      .update({ prompt: generatedPrompt })
      .eq('id', rowId)

    if (updateError) {
      console.error('[VariantRowPrompt] Failed to save prompt:', updateError)
      // Continue anyway - return the prompt even if save failed
    }

    console.log('[VariantRowPrompt] Generation successful', {
      rowId,
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length,
      promptStyle: process.env.PROMPT_VARIANTS_RICH !== 'false' ? 'seedream-v4-rich' : 'legacy-concise'
    })

    return NextResponse.json({ prompt: generatedPrompt })

  } catch (error) {
    console.error('[VariantRowPrompt] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

