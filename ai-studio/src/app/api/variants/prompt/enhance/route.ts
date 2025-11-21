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

    if (!existingPrompt || !userInstructions) {
      return NextResponse.json({ 
        error: 'existingPrompt and userInstructions are required' 
      }, { status: 400 })
    }

    if (!imagePaths || imagePaths.length === 0) {
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Sign URLs for the images (600s expiry for external API call)
    const signedUrls = await Promise.all(
      imagePaths.map((path: string) => signPath(path, 600))
    )

    console.log('[VariantPromptEnhance] Enhancing with Grok', {
      existingPromptLength: existingPrompt.length,
      instructionsLength: userInstructions.length,
      imagesCount: signedUrls.length,
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Enhance variant prompt using Grok (with adaptive sampling)
    const enhancedPrompt = await enhanceVariantPromptWithGrok(
      existingPrompt,
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

