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

      // Hard timeout: fail the job after 2 minutes without a provider id
      if (['queued', 'submitted', 'saving'].includes(job.status) && ageSec > 120) {
        await supabase.from('jobs').update({
          status: 'failed',
          error: 'timeout: no provider request id',
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Kick dispatcher to move on to next jobs
        try {
          await fetch(new URL('/api/dispatch', req.url), { method: 'POST', cache: 'no-store' })
        } catch {}

        return NextResponse.json({ status: 'failed', error: 'timeout: no provider request id' })
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

      // Mark intermediate 'saving' state to avoid UI "complete" before images are stored
      if (job.status !== 'saving') {
        await admin.from('jobs').update({ 
          status: 'saving', 
          updated_at: new Date().toISOString() 
        }).eq('id', job.id)
      }

      // Double-check job status after potential concurrent update
      const { data: updatedJob } = await admin.from('jobs').select('status').eq('id', job.id).single()
      if (updatedJob?.status === 'succeeded') {
        return NextResponse.json({ status: 'succeeded', step: 'done' })
      }

      const raw = responseData?.outputs ?? []
      const urls: string[] = Array.isArray(raw)
        ? raw.flatMap((v: any) => {
            if (!v) return []
            if (typeof v === 'string') return [v]
            if (v.url && typeof v.url === 'string') return [v.url]
            return []
          })
        : []
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
          is_upscaled: false
        })
      }
      
      if (inserts.length) {
        try {
          await admin.from('generated_images').insert(inserts)
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


