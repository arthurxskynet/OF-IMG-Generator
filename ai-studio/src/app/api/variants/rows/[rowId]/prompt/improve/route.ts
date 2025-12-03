import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { improveVariantPromptWithGrok } from '@/lib/ai-prompt-generator'
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
    const { existingPrompt } = body

    if (!existingPrompt) {
      return NextResponse.json({ 
        error: 'existingPrompt is required' 
      }, { status: 400 })
    }

    // Fetch row with images to get reference images for context
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select('*, variant_row_images (output_path, thumbnail_path, position, is_generated)')
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

    // Get reference images (where is_generated !== true)
    const images = (row as any).variant_row_images || []
    const referenceImages = images
      .filter((img: any) => img.is_generated !== true)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))

    // Sign URLs for reference images (600s expiry for external API call)
    let signedUrls: string[] | undefined = undefined
    if (referenceImages.length > 0) {
      const imagePaths = referenceImages.map((img: any) => img.output_path || img.thumbnail_path).filter(Boolean)
      if (imagePaths.length > 0) {
        const signed = await Promise.all(
          imagePaths.map((path: string) => signPath(path, 600))
        )
        signedUrls = signed.filter((url): url is string => url !== null)
      }
    }

    const imagesCount = signedUrls ? signedUrls.length : 0

    console.log('[VariantRowPromptImprove] Improving with Grok', {
      rowId,
      existingPromptLength: existingPrompt.length,
      imagesCount,
      mode: signedUrls ? 'with-images' : 'text-only',
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Improve variant prompt using Grok with Seedream 4.0 guidance
    const improvedPrompt = await improveVariantPromptWithGrok(
      existingPrompt,
      signedUrls
    )

    // Save prompt to row (RLS will enforce access)
    const { error: updateError } = await supabase
      .from('variant_rows')
      .update({ prompt: improvedPrompt })
      .eq('id', rowId)

    if (updateError) {
      console.error('[VariantRowPromptImprove] Failed to save prompt:', updateError)
      // Continue anyway - return the prompt even if save failed
    }

    console.log('[VariantRowPromptImprove] Improvement successful', {
      rowId,
      improvedLength: improvedPrompt.length,
      wordCount: improvedPrompt.split(/\s+/).length,
      promptStyle: process.env.PROMPT_VARIANTS_RICH !== 'false' ? 'seedream-v4-rich' : 'legacy-concise'
    })

    return NextResponse.json({ prompt: improvedPrompt })

  } catch (error) {
    console.error('[VariantRowPromptImprove] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
