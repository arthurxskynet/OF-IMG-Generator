import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { generateVariantPromptWithGrok } from '@/lib/ai-prompt-generator'
import { VariantPromptGenerateRequest, VariantPromptGenerateResponse } from '@/types/variants'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: VariantPromptGenerateRequest = await req.json()
    const { imagePaths } = body

    if (!imagePaths || imagePaths.length === 0) {
      return NextResponse.json({ 
        error: 'At least one image is required' 
      }, { status: 400 })
    }

    // Sign URLs for the images (600s expiry for external API call)
    const signed = await Promise.all(
      imagePaths.map((path: string) => signPath(path, 600))
    )
    const signedUrls = signed.filter((url): url is string => url !== null)
    
    if (signedUrls.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to sign image URLs' 
      }, { status: 400 })
    }

    console.log('[VariantPrompt] Generating with Grok', {
      imagesCount: signedUrls.length,
      useRichPrompts: process.env.PROMPT_VARIANTS_RICH !== 'false'
    })

    // Generate variant prompt using Grok (with adaptive sampling)
    const generatedPrompt = await generateVariantPromptWithGrok(signedUrls)

    const response: VariantPromptGenerateResponse = {
      prompt: generatedPrompt
    }

    console.log('[VariantPrompt] Generation successful', {
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length,
      promptStyle: process.env.PROMPT_VARIANTS_RICH !== 'false' ? 'seedream-v4-rich' : 'legacy-concise'
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('[VariantPrompt] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({ 
      error: `Failed to generate variant prompt: ${errorMessage}` 
    }, { status: 500 })
  }
}

