import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { promptQueueService } from '@/lib/prompt-queue'
import { PromptEnhanceQueueRequestSchema } from '@/types/prompt-queue'
import { signPath } from '@/lib/storage'

/**
 * POST /api/prompt/enhance/queue - Enqueue a prompt enhancement request
 */
export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { rowId, existingPrompt, userInstructions, swapMode, priority } = PromptEnhanceQueueRequestSchema.parse(body)

    // Get the row details to verify ownership and get model info
    const { data: row, error: rowError } = await supabase
      .from('model_rows')
      .select('*, models(*)')
      .eq('id', rowId)
      .eq('created_by', user.id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    const model = row.models
    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    // Build reference images array (same logic as generate route)
    const refImages = row.ref_image_urls !== null && row.ref_image_urls !== undefined
      ? row.ref_image_urls
      : model.default_ref_headshot_url 
        ? [model.default_ref_headshot_url]
        : []

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

    console.log('[PromptEnhance] Enqueue request', {
      rowId,
      existingPromptLength: existingPrompt.length,
      instructionsLength: userInstructions.length,
      refUrlsCount: refUrls.length,
      swapMode
    })

    // Enqueue the prompt enhancement
    const promptJobId = await promptQueueService.enqueuePromptEnhancement(
      rowId,
      model.id,
      user.id,
      existingPrompt,
      userInstructions,
      refUrls,
      targetUrl,
      priority,
      swapMode || 'face-hair'
    )

    // Get queue stats for estimated wait time
    const queueStats = await promptQueueService.getQueueStats()

    return NextResponse.json({
      promptJobId,
      status: 'queued',
      estimatedWaitTime: queueStats.estimatedWaitTime
    })

  } catch (error) {
    console.error('[PromptEnhance] Error:', error)
    
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ 
        error: 'Invalid request data',
        details: error.message 
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

