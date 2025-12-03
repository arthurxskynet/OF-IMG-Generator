import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { enhanceVariantPromptWithGrok } from '@/lib/ai-prompt-generator'
import { VariantPromptEnhanceRequest, VariantPromptEnhanceResponse } from '@/types/variants'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: VariantPromptEnhanceRequest = await req.json()
    const { existingPrompt, userInstructions, imagePaths } = body

    // Allow empty existingPrompt to enable generating new prompts from presets
    if (existingPrompt === undefined || existingPrompt === null || !userInstructions) {
      return NextResponse.json({ 
        error: 'userInstructions is required, and existingPrompt must be provided (can be empty string)' 
      }, { status: 400 })
    }

    // Normalize empty prompt to empty string
    const normalizedPrompt = existingPrompt || ''

    // Images are optional for enhancement - text-only is faster for preset enhancements
    let signedUrls: string[] | undefined = undefined
    if (imagePaths && imagePaths.length > 0) {
      // Sign URLs for the images (600s expiry for external API call)
      const signed = await Promise.all(
        imagePaths.map((path: string) => signPath(path, 600))
      )
      signedUrls = signed.filter((url): url is string => url !== null)
    }

    console.log('[VariantPromptEnhance] Enhancing with Grok', {
      existingPromptLength: normalizedPrompt.length,
      instructionsLength: userInstructions.length,
      imagesCount: signedUrls?.length || 0,
      mode: signedUrls ? 'with-images' : 'text-only',
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false',
      isNewPrompt: normalizedPrompt.length === 0
    })

    // Enhance variant prompt using Grok (text-only for speed, images optional)
    // If normalizedPrompt is empty, this will generate a new prompt from instructions
    const enhancedPrompt = await enhanceVariantPromptWithGrok(
      normalizedPrompt,
      userInstructions,
      signedUrls
    )

    const response: VariantPromptEnhanceResponse = {
      prompt: enhancedPrompt
    }

    console.log('[VariantPromptEnhance] Enhancement successful', {
      enhancedLength: enhancedPrompt.length,
      wordCount: enhancedPrompt.split(/\s+/).length,
      promptStyle: process.env.PROMPT_VARIANTS_RICH !== 'false' ? 'seedream-v4-rich' : 'legacy-concise'
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('[VariantPromptEnhance] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({ 
      error: `Failed to enhance variant prompt: ${errorMessage}` 
    }, { status: 500 })
  }
}

