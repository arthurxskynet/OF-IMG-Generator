import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { enhanceVariantPromptWithGrok } from '@/lib/ai-prompt-generator'

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

    // Get variant row with images
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
    if (images.length === 0) {
      return NextResponse.json({ 
        error: 'No images in this variant row' 
      }, { status: 400 })
    }

    // Sort by position and get image paths
    const sortedImages = images.sort((a: any, b: any) => a.position - b.position)
    const imagePaths = sortedImages.map((img: any) => img.output_path)

    // Sign URLs for the images
    const signedUrls = await Promise.all(
      imagePaths.map((path: string) => signPath(path, 600))
    )

    console.log('[VariantRowPromptEnhance] Enhancing with Grok', {
      rowId,
      existingPromptLength: existingPrompt.length,
      instructionsLength: userInstructions.length,
      imagesCount: signedUrls.length,
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Enhance variant prompt (with adaptive sampling)
    const enhancedPrompt = await enhanceVariantPromptWithGrok(
      existingPrompt,
      userInstructions,
      signedUrls
    )

    // Save prompt to row
    const { error: updateError } = await supabase
      .from('variant_rows')
      .update({ prompt: enhancedPrompt })
      .eq('id', rowId)
      .eq('user_id', user.id)

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

