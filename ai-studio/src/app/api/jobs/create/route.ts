import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { rowId } = await req.json()

    // Get the row details
    const { data: row, error: er1 } = await supabase
      .from('model_rows').select('*').eq('id', rowId).single()
    if (er1 || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

    // Get the model details
    const { data: model, error: er2 } = await supabase
      .from('models').select('*').eq('id', row.model_id).single()
    if (er2 || !model) return NextResponse.json({ error: 'Model not found' }, { status: 404 })

    const basePrompt = row.prompt_override ?? model.default_prompt
    const size = model.size
    const finalPrompt = (basePrompt?.trim() ?? '')
    
    // Build reference images array - use row refs if available, otherwise fallback to model default
    const refImages = row.ref_image_urls && row.ref_image_urls.length > 0 
      ? row.ref_image_urls 
      : model.default_ref_headshot_url 
        ? [model.default_ref_headshot_url] 
        : []
    
    const payload = {
      refPaths: refImages,
      targetPath: row.target_image_url,
      prompt: finalPrompt,
      size
    }
    
    if (!payload.refPaths || payload.refPaths.length === 0 || !payload.targetPath) {
      return NextResponse.json({ error: 'Missing ref/target' }, { status: 400 })
    }

    // Insert a single queued job (provider will handle single-output)
    const jobsInsert = [{
      row_id: row.id,
      model_id: model.id,
      team_id: model.team_id,
      user_id: user.id,
      request_payload: payload,
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

    return NextResponse.json({ ok: true, enqueued: jobIds.length, jobIds })
    
  } catch (error) {
    console.error('Job creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


