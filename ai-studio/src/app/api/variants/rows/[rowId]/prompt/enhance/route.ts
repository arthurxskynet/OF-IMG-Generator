import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { enhanceVariantPromptWithGrok } from '@/lib/ai-prompt-generator'
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
    const body = await req.json()
    const { existingPrompt, userInstructions } = body

    if (!existingPrompt || !userInstructions) {
      return NextResponse.json({ 
        error: 'existingPrompt and userInstructions are required' 
      }, { status: 400 })
    }

    // For enhancement, we don't need images - we're just modifying the prompt text
    // This speeds up the request significantly, especially for preset enhancements
    // Only fetch images if we need them (for future use cases that might require visual context)
    // Optional: Get images only if needed (currently skipping for speed)
    // Uncomment below if visual context is needed for specific enhancement types
    /*
    let signedUrls: string[] | undefined = undefined
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select(`
        *,
        variant_row_images (
          output_path,
          thumbnail_path,
          position
        )
      `)
      .eq('id', rowId)
      .eq('user_id', user.id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    const images = (row as any).variant_row_images || []
    if (images.length > 0) {
      const sortedImages = images.sort((a: any, b: any) => a.position - b.position)
      const imagePaths = sortedImages.map((img: any) => img.output_path)
      signedUrls = await Promise.all(
        imagePaths.map((path: string) => signPath(path, 600))
      )
    }
    */

    // Check access before enhancing
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

    const signedUrls: string[] | undefined = undefined as string[] | undefined
    const imagesCount = signedUrls ? signedUrls.length : 0

    console.log('[VariantRowPromptEnhance] Enhancing with Grok', {
      rowId,
      existingPromptLength: existingPrompt.length,
      instructionsLength: userInstructions.length,
      imagesCount,
      mode: signedUrls ? 'with-images' : 'text-only',
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Enhance variant prompt (text-only for speed, images optional)
    const enhancedPrompt = await enhanceVariantPromptWithGrok(
      existingPrompt,
      userInstructions,
      signedUrls
    )

    // Save prompt to row (RLS will enforce access)
    const { error: updateError } = await supabase
      .from('variant_rows')
      .update({ prompt: enhancedPrompt })
      .eq('id', rowId)

    if (updateError) {
      console.error('[VariantRowPromptEnhance] Failed to save prompt:', updateError)
      // Continue anyway - return the prompt even if save failed
    }

    console.log('[VariantRowPromptEnhance] Enhancement successful', {
      rowId,
      enhancedLength: enhancedPrompt.length,
      wordCount: enhancedPrompt.split(/\s+/).length,
      promptStyle: process.env.PROMPT_VARIANTS_RICH !== 'false' ? 'seedream-v4-rich' : 'legacy-concise'
    })

    return NextResponse.json({ prompt: enhancedPrompt })

  } catch (error) {
    console.error('[VariantRowPromptEnhance] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

