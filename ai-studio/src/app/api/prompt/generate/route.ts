import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { generatePromptWithGrok, SwapMode } from '@/lib/ai-prompt-generator'
import { PromptGenerationRequest, PromptGenerationResponse } from '@/types/ai-prompt'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: PromptGenerationRequest & { swapMode?: SwapMode } = await req.json()
    const { rowId, swapMode = 'face-hair' } = body

    if (!rowId) {
      return NextResponse.json({ error: 'rowId is required' }, { status: 400 })
    }

    // Get the row details
    const { data: row, error: rowError } = await supabase
      .from('model_rows')
      .select('*')
      .eq('id', rowId)
      .eq('created_by', user.id) // Ensure user owns the row
      .single()

    if (rowError || !row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    // Get the model details
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('id', row.model_id)
      .single()

    if (modelError || !model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    // Build reference images array
    // If ref_image_urls is explicitly set (even if empty), use it
    // If ref_image_urls is null/undefined, fallback to model defaults
    const refImages = row.ref_image_urls !== null && row.ref_image_urls !== undefined
      ? row.ref_image_urls  // Use row's ref images (could be empty array if user removed all refs)
      : model.default_ref_headshot_urls && model.default_ref_headshot_urls.length > 0
        ? model.default_ref_headshot_urls  // Fallback to model default array
        : model.default_ref_headshot_url 
          ? [model.default_ref_headshot_url]  // Fallback to legacy single default (backward compatibility)
          : []  // No references at all

    console.log('[Prompt Generation] Reference images logic:', {
      rowRefImageUrls: row.ref_image_urls,
      modelDefaultRefs: model.default_ref_headshot_urls,
      modelDefaultRefLegacy: model.default_ref_headshot_url,
      finalRefImages: refImages,
      refImagesLength: refImages.length
    })

    // Validate we have required images (only target image is required)
    if (!row.target_image_url) {
      return NextResponse.json({ 
        error: 'No target image found. Please upload a target image first.' 
      }, { status: 400 })
    }

    // Sign URLs for the images (600s expiry for external API call)
    const [refUrlsRaw, targetUrl] = await Promise.all([
      refImages && refImages.length > 0 
        ? Promise.all(refImages.map((path: string) => signPath(path, 600)))
        : Promise.resolve([]),
      signPath(row.target_image_url, 600)
    ])
    
    // Filter out null values (missing files)
    const refUrls = (Array.isArray(refUrlsRaw) ? refUrlsRaw : []).filter((url): url is string => url !== null)
    
    // Validate target URL exists
    if (!targetUrl) {
      return NextResponse.json({ error: 'Target image not found or cannot be accessed' }, { status: 404 })
    }

    console.log('[Prompt Generation] After URL signing:', {
      refUrls: refUrls,
      refUrlsLength: refUrls.length,
      targetUrl: targetUrl,
      operationType: refUrls.length > 0 ? 'face-swap' : 'target-only'
    })

          console.log('[Prompt Generation] Processing with Grok', { 
            rowId, 
            refImagesCount: refUrls.length,
            hasTarget: !!targetUrl,
            operationType: refUrls.length > 0 ? 'face-swap' : 'target-only',
            swapMode: swapMode
          })

    // Generate prompt using Grok with swapMode
    const generatedPrompt = await generatePromptWithGrok(refUrls, targetUrl, swapMode)

    const response: PromptGenerationResponse = {
      prompt: generatedPrompt
    }

          console.log('[Prompt Generation] Grok Success', { 
            rowId, 
            promptLength: generatedPrompt.length 
          })

    return NextResponse.json(response)

  } catch (error) {
    console.error('[Prompt Generation] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({ 
      error: `Failed to generate prompt: ${errorMessage}` 
    }, { status: 500 })
  }
}
