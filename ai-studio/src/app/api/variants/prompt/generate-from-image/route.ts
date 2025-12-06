import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { generateStructuredPromptFromImage } from '@/lib/ai-prompt-generator'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { imagePath } = body

    if (!imagePath) {
      return NextResponse.json({ 
        error: 'imagePath is required' 
      }, { status: 400 })
    }

    // Sign URL for the image (600s expiry for external API call)
    const signedUrl = await signPath(imagePath, 600)
    
    if (!signedUrl) {
      return NextResponse.json({ 
        error: 'Failed to sign image URL' 
      }, { status: 400 })
    }

    console.log('[StructuredPrompt] Generating with Grok', {
      imagePath,
      hasSignedUrl: !!signedUrl
    })

    // Generate structured prompt using Grok
    const generatedPrompt = await generateStructuredPromptFromImage(signedUrl)

    const response = {
      prompt: generatedPrompt
    }

    console.log('[StructuredPrompt] Generation successful', {
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('[StructuredPrompt] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({ 
      error: `Failed to generate structured prompt: ${errorMessage}` 
    }, { status: 500 })
  }
}


