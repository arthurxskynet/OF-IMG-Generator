import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { promptQueueService } from '@/lib/prompt-queue'
import { signPath } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { rowId, useAiPrompt = false } = await req.json()

    // Get the row details
    const { data: row, error: er1 } = await supabase
      .from('model_rows').select('*').eq('id', rowId).single()
    if (er1 || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

    // Get the model details
    const { data: model, error: er2 } = await supabase
      .from('models').select('*').eq('id', row.model_id).single()
    if (er2 || !model) return NextResponse.json({ error: 'Model not found' }, { status: 404 })

    const basePrompt = row.prompt_override ?? model.default_prompt
    const outputWidth = model.output_width || 4096
    const outputHeight = model.output_height || 4096
    
    // Build reference images array
    // If ref_image_urls is explicitly set (even if empty), use it
    // If ref_image_urls is null/undefined, fallback to model default
    const refImages = row.ref_image_urls !== null && row.ref_image_urls !== undefined
      ? row.ref_image_urls  // Use row's ref images (could be empty array if user removed all refs)
      : model.default_ref_headshot_url 
        ? [model.default_ref_headshot_url]  // Fallback to model default
        : []  // No references at all
    
    // Validate we have required images (only target image is required)
    if (!row.target_image_url) {
      return NextResponse.json({ 
        error: 'No target image found. Please upload a target image first.' 
      }, { status: 400 })
    }

    const finalPrompt = basePrompt?.trim() ?? ''
    let promptJobId: string | null = null
    let promptStatus: 'pending' | 'generating' | 'completed' | 'failed' = 'pending'

    // If AI prompt generation is requested, queue it
    if (useAiPrompt) {
      try {
        // Sign URLs for the images (600s expiry for external API call)
        const [refUrls, targetUrl] = await Promise.all([
          refImages && refImages.length > 0 
            ? Promise.all(refImages.map((path: string) => signPath(path, 600)))
            : Promise.resolve([]),
          signPath(row.target_image_url, 600)
        ])
        
        console.log('[JobCreate] Reference images logic:', {
          rowRefImageUrls: row.ref_image_urls,
          modelDefaultRef: model.default_ref_headshot_url,
          finalRefImages: refImages,
          refImagesLength: refImages.length,
          signedRefUrlsLength: refUrls.length,
          operationType: refUrls.length > 0 ? 'face-swap' : 'target-only'
        })

        // Enqueue prompt generation with high priority
        promptJobId = await promptQueueService.enqueuePromptGeneration(
          rowId,
          model.id,
          user.id,
          refUrls,
          targetUrl,
          8 // High priority for user-initiated requests
        )

        promptStatus = 'generating'
        console.log('[JobCreate] Enqueued AI prompt generation', { 
          rowId, 
          promptJobId,
          refImagesCount: refUrls.length,
          operationType: refUrls.length > 0 ? 'face-swap' : 'target-only'
        })

      } catch (error) {
        console.error('[JobCreate] Failed to enqueue prompt generation:', error)
        // Continue with manual prompt if AI generation fails to enqueue
        promptStatus = 'failed'
      }
    }
    
    const payload = {
      refPaths: refImages,
      targetPath: row.target_image_url,
      prompt: finalPrompt, // Will be updated when AI prompt completes
      width: outputWidth,
      height: outputHeight
    }

    // Insert a single queued job (provider will handle single-output)
    const jobsInsert = [{
      row_id: row.id,
      model_id: model.id,
      team_id: model.team_id,
      user_id: user.id,
      request_payload: payload,
      prompt_job_id: promptJobId,
      prompt_status: promptStatus,
      status: 'queued'
    }]

    const { data: inserted, error: er3 } = await supabase
      .from('jobs')
      .insert(jobsInsert)
      .select('id')
    
    if (er3) {
      console.error('Insert jobs failed:', er3)
      return NextResponse.json({ error: 'Insert jobs failed' }, { status: 500 })
    }

    // Update row status to queued
    await supabase.from('model_rows').update({ status: 'queued' }).eq('id', row.id)

    const jobIds = inserted?.map(job => job.id) || []

    console.log('[JobCreate] created jobs', { count: jobIds.length, jobIds })

    // Increment per-user generation usage counter (non-blocking for main flow)
    try {
      const step = Math.max(1, jobIds.length || 0)
      const { error: usageErr } = await supabase.rpc('increment_generation_count', { step })
      if (usageErr) console.warn('[Usage] increment failed:', usageErr.message)
    } catch (e) {
      console.warn('[Usage] increment threw:', e)
    }

    // Trigger dispatcher asynchronously after response (don't await to prevent race condition)
    // The database transaction needs to commit before dispatch can claim the jobs
    const dispatchUrl = new URL('/api/dispatch', req.url)
    fetch(dispatchUrl, { 
      method: 'POST', 
      cache: 'no-store', 
      headers: { 'x-dispatch-model': model.id } 
    }).then(res => {
      if (!res.ok) console.warn('[JobCreate] dispatcher returned non-OK')
    }).catch(e => console.warn('[JobCreate] dispatcher failed:', e))

    return NextResponse.json({ 
      ok: true, 
      enqueued: jobIds.length, 
      jobIds,
      promptJobId,
      promptStatus,
      useAiPrompt
    })
    
  } catch (error) {
    console.error('Job creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


