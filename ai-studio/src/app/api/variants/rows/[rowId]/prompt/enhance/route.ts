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

