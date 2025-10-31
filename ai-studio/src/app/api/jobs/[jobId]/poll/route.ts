import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { createServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchAndSaveToOutputs } from '@/lib/storage'

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Use admin client for DB access; enforce ownership with explicit check
    const admin = supabaseAdmin
    const { data: job } = await admin.from('jobs').select('*').eq('id', jobId).single()
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (job.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    
    // If no provider request ID, attempt recovery + stop infinite loops after TTL
    if (!job.provider_request_id) {
      console.log('[Poll] no provider_request_id', { 
        jobId, 
        status: job.status,
        createdAt: job.created_at 
      })

      const createdAtMs = job.created_at ? Date.parse(job.created_at) : Date.now()
      const ageSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000))

      // Best-effort retry: if queued/submitted for >10s, try to trigger dispatch again
      // But only retry periodically to avoid spam (every 15 seconds)
      if (['queued', 'submitted', 'saving'].includes(job.status) && ageSec > 10 && ageSec % 15 < 2) {
        try {
          await fetch(new URL('/api/dispatch', req.url), { method: 'POST', cache: 'no-store' })
          console.log('[Poll] re-dispatch triggered', { jobId, ageSec })
        } catch (e) {
          console.warn('[Poll] re-dispatch failed', { jobId, error: e instanceof Error ? e.message : String(e) })
        }
      }

      // Hard timeout: fail the job after 90 seconds without a provider id
      if (['queued', 'submitted', 'saving'].includes(job.status) && ageSec > 90) {
        await supabase.from('jobs').update({
          status: 'failed',
          error: 'timeout: no provider request id',
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status to error if all jobs failed
        const [{ count: remaining }, { count: succeeded }] = await Promise.all([
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', job.row_id)
            .in('status', ['queued', 'running', 'submitted', 'saving']),
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', job.row_id)
            .eq('status', 'succeeded')
        ])

        await supabase.from('model_rows').update({
          status: (remaining ?? 0) > 0
            ? 'partial'
            : (succeeded ?? 0) > 0
              ? 'done'
              : 'error'
        }).eq('id', job.row_id)

        // Kick dispatcher to move on to next jobs
        try {
          await fetch(new URL('/api/dispatch', req.url), { method: 'POST', cache: 'no-store' })
        } catch {}

        return NextResponse.json({ status: 'failed', error: 'timeout: no provider request id' })
      }

      // Additional cleanup: fail very old queued jobs (2+ minutes) immediately
      if (job.status === 'queued' && ageSec > 120) {
        await supabase.from('jobs').update({
          status: 'failed',
          error: 'timeout: stuck in queue too long',
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status
        const [{ count: remaining2 }, { count: succeeded2 }] = await Promise.all([
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', job.row_id)
            .in('status', ['queued', 'running', 'submitted', 'saving']),
          supabase.from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('row_id', job.row_id)
            .eq('status', 'succeeded')
        ])

        await supabase.from('model_rows').update({
          status: (remaining2 ?? 0) > 0
            ? 'partial'
            : (succeeded2 ?? 0) > 0
              ? 'done'
              : 'error'
        }).eq('id', job.row_id)

        return NextResponse.json({ status: 'failed', error: 'timeout: stuck in queue too long' })
      }

      // Also return queuePosition for visibility while waiting for provider id
      const { count: ahead } = await admin.from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'submitted'])
        .eq('team_id', job.team_id)
        .lt('created_at', job.created_at)
      return NextResponse.json({ status: job.status, queuePosition: ahead ?? 0, step: job.status })
    }

    // Poll the WaveSpeed API for results (single long request, no retry to avoid duplication)
    const base = process.env.WAVESPEED_API_BASE || 'https://api.wavespeed.ai'
    const resp = await axios.get(
      `${base}/api/v3/predictions/${job.provider_request_id}/result`,
      { 
        headers: { Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}` }, 
        timeout: 600_000 
      }
    )
    // WaveSpeed API response structure: { code, message, data: { id, status, outputs, ... } }
    const responseData = resp?.data?.data

    // Still processing
    if (!responseData || responseData.status === 'processing' || responseData.status === 'created') {
      if (job.status !== 'running') {
        await admin.from('jobs').update({ 
          status: 'running', 
          updated_at: new Date().toISOString() 
        }).eq('id', job.id)
      }
      // Include queue position diminishing to zero as job runs
      const { count: ahead } = await admin.from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'submitted'])
        .eq('team_id', job.team_id)
        .lt('created_at', job.created_at)
      return NextResponse.json({ status: 'running', queuePosition: ahead ?? 0, step: 'running' })
    }

    // Success - process the images
    if (responseData.status === 'succeeded' || responseData.status === 'completed') {
      // Early return if job is already succeeded to prevent duplicate processing
      if (job.status === 'succeeded') {
        return NextResponse.json({ status: 'succeeded', step: 'done' })
      }

      // Use a more robust atomic approach: try to claim the job for processing
      // This prevents race conditions by using a database-level atomic operation
      const { data: claimResult, error: claimError } = await admin
        .from('jobs')
        .update({ 
          status: 'saving', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', job.id)
        .in('status', ['running', 'submitted']) // Only claim if still in these states
        .select('id, status')
      
      // If no rows were updated, another request already claimed this job
      if (claimError || !claimResult || claimResult.length === 0) {
        console.log('[Poll] Job already claimed by another request', { 
          jobId: job.id, 
          currentStatus: job.status,
          claimError: claimError?.message 
        })
        return NextResponse.json({ status: 'succeeded', step: 'done' })
      }

      const raw = responseData?.outputs ?? []
      // SeaDream only returns one image, so take only the first one
      const urls: string[] = Array.isArray(raw) && raw.length > 0
        ? (() => {
            const firstOutput = raw[0]
            if (typeof firstOutput === 'string') return [firstOutput]
            if (firstOutput?.url && typeof firstOutput.url === 'string') return [firstOutput.url]
            return []
          })()
        : []
      
      console.log('[Poll] Processing SeaDream output (single image)', {
        jobId: job.id,
        rawOutputsCount: raw.length,
        singleUrl: urls[0] || 'none',
        outputs: raw
      })
      
      // Check if images already exist for this job (primary duplicate prevention)
      const { data: existingImages } = await admin
        .from('generated_images')
        .select('output_url')
        .eq('job_id', job.id)

      const existingUrls = new Set((existingImages || []).map(img => img.output_url))
      if (existingUrls.size > 0) {
        console.log('[Poll] Images already exist for job', { 
          jobId: job.id, 
          existingCount: existingUrls.size 
        })
        // Skip to marking job as succeeded
        await admin.from('jobs').update({ 
          status: 'succeeded', 
          updated_at: new Date().toISOString() 
        }).eq('id', job.id)
        return NextResponse.json({ status: 'succeeded', step: 'done' })
      }

      // No need for additional status check since we atomically transitioned to 'saving'
      
      // Early URL deduplication check - prevent downloading same remote URL multiple times
      if (urls.length > 0) {
        const remoteUrl = urls[0]
        
        // Check if this exact remote URL was already processed for this row
        const { data: existingRemoteUrl } = await admin
          .from('generated_images')
          .select('id, output_url')
          .eq('row_id', job.row_id)
          .limit(10) // Get recent images to check
        
        // Check if any existing image has the same remote URL pattern
        const isDuplicate = existingRemoteUrl?.some(img => {
          // Extract filename from both URLs for comparison
          const existingFilename = img.output_url.split('/').pop()?.split('?')[0]
          const newFilename = remoteUrl.split('/').pop()?.split('?')[0]
          return existingFilename && newFilename && existingFilename.includes(newFilename.split('-')[0])
        })
        
        if (isDuplicate) {
          console.log('[Poll] Remote URL already processed for this row', { 
            jobId: job.id, 
            rowId: job.row_id,
            remoteUrl,
            existingImages: existingRemoteUrl?.length || 0
          })
          // Mark job as succeeded and return
          await admin.from('jobs').update({ 
            status: 'succeeded', 
            updated_at: new Date().toISOString() 
          }).eq('id', job.id)
          return NextResponse.json({ status: 'succeeded', step: 'done' })
        }
      }
      
      const inserts = []
      
      for (const u of urls) {
        const uploaded = await fetchAndSaveToOutputs(u, job.user_id)
        inserts.push({
          job_id: job.id,
          row_id: job.row_id,
          model_id: job.model_id,
          team_id: job.team_id,
          user_id: job.user_id,
          output_url: uploaded.objectPath,
          thumbnail_url: uploaded.thumbnailPath || null,
          is_upscaled: false
        })
      }
      
      if (inserts.length) {
        // Final safety check: verify job is still in 'saving' status before inserting
        const { data: finalStatusCheck } = await admin
          .from('jobs')
          .select('status')
          .eq('id', job.id)
          .single()
        
        if (finalStatusCheck?.status !== 'saving') {
          console.log('[Poll] Job status changed during processing, skipping insert', { 
            jobId: job.id, 
            expectedStatus: 'saving',
            actualStatus: finalStatusCheck?.status 
          })
        } else {
          try {
            await admin.from('generated_images').insert(inserts)
            console.log('[Poll] Successfully saved image for job', { 
              jobId: job.id, 
              imageCount: inserts.length 
            })
          } catch (error: any) {
            // Handle unique constraint violation gracefully
            if (error?.code === '23505' && error?.constraint === 'unique_job_output_url') {
              console.log('[Poll] Duplicate images prevented for job', { jobId: job.id })
              // Continue to mark job as succeeded since images were already saved
            } else {
              // Re-throw other database errors
              throw error
            }
          }
        }
      }

      await admin.from('jobs').update({ 
        status: 'succeeded', 
        updated_at: new Date().toISOString() 
      }).eq('id', job.id)

      // Update row status depending on any remaining queued/submitted/running jobs
      const { count: remaining } = await admin.from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('row_id', job.row_id)
        .in('status', ['queued','submitted','running','saving'])
        
      await admin.from('model_rows').update({ 
        status: (remaining ?? 0) > 0 ? 'partial' : 'done' 
      }).eq('id', job.row_id)

      // Try dispatching more if capacity available (hard cap 3)
      await fetch(new URL('/api/dispatch', req.url), { 
        method: 'POST', 
        headers: { 'x-dispatch-model': job.model_id } 
      })

      return NextResponse.json({ status: 'succeeded', step: 'done' })
    }

    // Failed
    await admin.from('jobs').update({
      status: 'failed',
      error: responseData?.error ?? resp?.data?.message ?? 'provider failed',
      updated_at: new Date().toISOString()
    }).eq('id', job.id)

    // Free up slot and dispatch next
    await fetch(new URL('/api/dispatch', req.url), { 
      method: 'POST', 
      headers: { 'x-dispatch-model': job.model_id } 
    })
    
    return NextResponse.json({ status: 'failed', error: responseData?.error ?? 'failed', step: 'failed' })

  } catch (e: any) {
    // Transient errors -> keep as running, don't change status
    console.error('Job polling error:', { message: e?.message, status: e?.response?.status, data: e?.response?.data })
    return NextResponse.json({ status: 'running', step: 'running' })
  }
}


