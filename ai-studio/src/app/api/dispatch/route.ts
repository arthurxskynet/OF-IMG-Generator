import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { signPath, normalizeStoragePath } from '@/lib/storage'
import { getWaveSpeedModel, dimensionsToAspectRatio, dimensionsToResolution, DEFAULT_MODEL_ID } from '@/lib/wavespeed-models'
// import { getRemoteImageSizeAsSeedream } from '@/lib/server-utils'
// import { normalizeSizeOrDefault } from '@/lib/utils'
import type { Job } from '@/types/jobs'

const MAX_CONCURRENCY = Number(process.env.DISPATCH_MAX_CONCURRENCY || 3)
const ACTIVE_WINDOW_MS = Number(process.env.DISPATCH_ACTIVE_WINDOW_MS || 10 * 60 * 1000) // 10 minutes
const STALE_MAX_MS = Number(process.env.DISPATCH_STALE_MAX_MS || 60 * 60 * 1000) // 60 minutes
const ACTIVE_STATUSES: Job['status'][] = ['submitted', 'running', 'saving']
// Track last cleanup time for periodic cleanup (every 30 seconds)
let lastCleanupTime = 0

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin
  
  // Dispatcher may be called from server internally; allow unauthenticated but DO NOT expose job data.
  // If you require auth, swap to service key in a private cron route. We'll allow anon here but restrict inputs.

  try {
    console.log('[Dispatch] start', { timestamp: new Date().toISOString() })

    // Clean up clearly stuck jobs to avoid capacity deadlock
    try {
      // Fail any 'running' or 'saving' without provider id after 2 minutes
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      await supabase.from('jobs')
        .update({ status: 'failed', error: 'timeout: no provider request id', updated_at: new Date().toISOString() })
        .is('provider_request_id', null)
        .in('status', ['running', 'saving'])
        .lt('updated_at', twoMinAgo)

      // Fail very stale submitted/running/saving jobs after STALE_MAX_MS (provider likely dead)
      const staleCutoff = new Date(Date.now() - STALE_MAX_MS).toISOString()
      await supabase.from('jobs')
        .update({ status: 'failed', error: 'stale: auto-cleanup', updated_at: new Date().toISOString() })
        .in('status', ['submitted', 'running', 'saving'])
        .lt('updated_at', staleCutoff)

      // Fail very old queued jobs (2+ minutes) that dispatcher never picked up
      const twoMinAgoQueued = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      await supabase.from('jobs')
        .update({ status: 'failed', error: 'timeout: stuck in queue', updated_at: new Date().toISOString() })
        .eq('status', 'queued')
        .lt('created_at', twoMinAgoQueued)
    } catch {}

    // Check queued jobs count before claiming (diagnostic)
    const { count: queuedCount } = await supabase.from('jobs')
      .select('*', { head: true, count: 'exact' })
      .eq('status', 'queued')
    
    console.log('[Dispatch] queued jobs in DB', { queuedCount })

    // Atomically check capacity and claim jobs (prevents race conditions)
    // This function ensures only MAX_CONCURRENCY jobs are active at once
    const { data: claimed, error } = await supabase.rpc('claim_jobs_with_capacity', {
      p_max_concurrency: MAX_CONCURRENCY,
      p_active_window_ms: ACTIVE_WINDOW_MS
    }) as { data: Job[] | null, error: any }
    
    if (error) {
      console.error('[Dispatch] failed to claim jobs:', error)
      return NextResponse.json({ error: 'claim failed' }, { status: 500 })
    }
    
    if (!claimed?.length) {
      console.log('[Dispatch] nothing to claim (RPC returned empty)')
      return NextResponse.json({ ok: true, info: 'nothing to claim' })
    }

    console.log('[Dispatch] claimed', { 
      count: claimed.length, 
      jobIds: claimed.map(j => j.id)
    })

    // Validate envs once (base URL falls back to docs value; API key required)
    const hasKey = !!process.env.WAVESPEED_API_KEY
    const hasBase = !!process.env.WAVESPEED_API_BASE
    console.log('[Dispatch] env check', { hasKey, hasBase })
    
    if (!hasKey) {
      console.error('[Dispatch] WaveSpeed API key missing')
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    // Mark associated rows as running if they were queued/idle
    const rowIds = [...new Set(claimed.map(job => job.row_id).filter(Boolean))]
    if (rowIds.length > 0) {
      await supabase.rpc('mark_rows_running', { p_row_ids: rowIds })
    }

    // Mark associated variant rows as running if they were queued/idle
    const variantRowIds = [...new Set(claimed.map(job => job.variant_row_id).filter(Boolean))]
    if (variantRowIds.length > 0) {
      await supabase.rpc('mark_variant_rows_running', { p_variant_row_ids: variantRowIds })
    }

    // Process claimed jobs in parallel to utilize available slots
    console.log('[Dispatch] processing jobs', { count: claimed.length })
    
    await Promise.allSettled(claimed.map(async (job) => {
      try {
        const payload = job.request_payload as {
          refPaths: string[]
          targetPath: string
          prompt: string
          width: number
          height: number
          generation_model?: string
        }

        // Check if this job is waiting for AI prompt generation
        if (job.prompt_job_id && job.prompt_status === 'generating') {
          console.log('[Dispatch] job waiting for prompt generation', { 
            jobId: job.id, 
            promptJobId: job.prompt_job_id 
          })

          // Check prompt generation status
          const { data: promptJob } = await supabase
            .from('prompt_generation_jobs')
            .select('status, generated_prompt, error')
            .eq('id', job.prompt_job_id)
            .single()

          if (promptJob?.status === 'completed' && promptJob.generated_prompt) {
            // Update job with generated prompt
            await supabase
              .from('jobs')
              .update({
                prompt_status: 'completed',
                request_payload: {
                  ...payload,
                  prompt: promptJob.generated_prompt
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', job.id)

            console.log('[Dispatch] updated job with AI prompt', { 
              jobId: job.id, 
              promptLength: promptJob.generated_prompt.length 
            })

            // Update payload for processing
            payload.prompt = promptJob.generated_prompt

          } else if (promptJob?.status === 'failed') {
            // Mark job as failed due to prompt generation failure
            await supabase
              .from('jobs')
              .update({
                status: 'failed',
                prompt_status: 'failed',
                error: promptJob.error || 'AI prompt generation failed',
                updated_at: new Date().toISOString()
              })
              .eq('id', job.id)

            console.log('[Dispatch] job failed due to prompt generation', { 
              jobId: job.id, 
              error: promptJob.error 
            })
            return // Skip processing this job
          } else {
            // Still processing, put job back to queued status
            await supabase
              .from('jobs')
              .update({
                status: 'queued',
                updated_at: new Date().toISOString()
              })
              .eq('id', job.id)

            console.log('[Dispatch] job still waiting for prompt, requeued', { 
              jobId: job.id, 
              promptStatus: promptJob?.status 
            })
            return // Skip processing this job
          }
        }

        console.log('[Dispatch] job start', { 
          jobId: job.id,
          currentStatus: job.status,
          variantRowId: job.variant_row_id,
          rowId: job.row_id,
          modelId: job.model_id,
          refPathsCount: payload.refPaths?.length || 0,
          refPaths: payload.refPaths?.map(p => p.slice(-30)) || [],
          targetPath: payload.targetPath?.slice(-30),
          promptLength: payload.prompt?.length || 0,
          generationModel: payload.generation_model || DEFAULT_MODEL_ID
        })

        // Normalize all paths before signing URLs
        const normalizedRefPaths = (payload.refPaths || [])
          .map(path => normalizeStoragePath(path))
          .filter((path): path is string => path !== null)
        const normalizedTargetPath = normalizeStoragePath(payload.targetPath)
        
        // Log any paths that failed to normalize
        if (normalizedRefPaths.length < (payload.refPaths?.length || 0)) {
          const failedPaths = (payload.refPaths || [])
            .map(path => ({ original: path, normalized: normalizeStoragePath(path) }))
            .filter(({ normalized }) => !normalized)
            .map(({ original }) => original)
          console.error('[Dispatch] Some reference paths failed to normalize', {
            jobId: job.id,
            failedPaths,
            totalRefPaths: payload.refPaths?.length || 0,
            normalizedCount: normalizedRefPaths.length
          })
        }
        
        if (!normalizedTargetPath) {
          console.error('[Dispatch] Target path failed to normalize', {
            jobId: job.id,
            rawTargetPath: payload.targetPath
          })
          throw new Error(`Target image path is invalid: ${payload.targetPath}`)
        }

        // Sign URLs for the images (600s expiry for external API call)
        const signStart = Date.now()
        const [refUrlsRaw, targetUrl] = await Promise.all([
          normalizedRefPaths.length > 0 
            ? Promise.all(normalizedRefPaths.map(path => signPath(path, 600)))
            : Promise.resolve([]),
          signPath(normalizedTargetPath, 600)
        ])
        
        // Filter out null values (missing files) and log which ones failed
        const refUrls = (Array.isArray(refUrlsRaw) ? refUrlsRaw : []).filter((url): url is string => url !== null)
        const failedRefSigns = normalizedRefPaths.filter((path, index) => !refUrlsRaw[index])
        
        if (failedRefSigns.length > 0) {
          console.warn('[Dispatch] Some reference image URLs failed to sign', {
            jobId: job.id,
            failedPaths: failedRefSigns.map(p => p.slice(-40)),
            totalRefPaths: normalizedRefPaths.length,
            successfulSigns: refUrls.length
          })
        }
        
        // Validate target URL exists
        if (!targetUrl) {
          console.error('[Dispatch] Target image URL signing failed', {
            jobId: job.id,
            normalizedPath: normalizedTargetPath,
            rawPath: payload.targetPath
          })
          throw new Error(`Target image not found or cannot be accessed: ${normalizedTargetPath}`)
        }
        
        console.log('[Dispatch] signed URLs', { 
          jobId: job.id, 
          refUrlsCount: refUrls.length,
          hasRefPaths: payload.refPaths && payload.refPaths.length > 0,
          refPathsCount: payload.refPaths?.length || 0,
          operationType: refUrls.length > 0 ? 'face-swap' : 'target-only',
          duration: Date.now() - signStart 
        })

        // Build prompt (already hinted in creation if multiple desired)
        const finalPrompt = payload.prompt

        // Extract dimensions from payload
        const width = payload.width || 4096
        const height = payload.height || 4096
        
        // Validate dimensions are within WaveSpeed API limits
        const clampedWidth = Math.max(1024, Math.min(4096, width))
        const clampedHeight = Math.max(1024, Math.min(4096, height))
        
        // Get generation model (default to nano-banana-pro-edit)
        const generationModel = payload.generation_model || DEFAULT_MODEL_ID
        const modelConfig = getWaveSpeedModel(generationModel)
        
        console.log('[Dispatch] using model', { 
          jobId: job.id, 
          generationModel,
          modelName: modelConfig.name,
          width: clampedWidth,
          height: clampedHeight
        })

        // Base URL fallback to docs value if unset
        const base = process.env.WAVESPEED_API_BASE || 'https://api.wavespeed.ai'

        // Minimal logging (no full signed URLs)
        const previewUrl = (u: string) => {
          try {
            const url = new URL(u)
            const parts = url.pathname.split('/')
            const last = parts[parts.length - 1] || ''
            return `${url.host}/…/${last.slice(-16)}`
          } catch {
            return 'url'
          }
        }

        // Combine reference images with target image (refs first, target last)
        // Handle case where no reference images exist (target-only processing)
        const allImages = refUrls.length > 0 ? [...refUrls, targetUrl] : [targetUrl]
        
        // Build request payload based on model type
        let requestPayload: any
        if (generationModel === 'nano-banana-pro-edit') {
          // Nano Banana Pro Edit uses resolution, aspect_ratio, and output_format
          const resolution = dimensionsToResolution(clampedWidth, clampedHeight)
          const aspectRatio = dimensionsToAspectRatio(clampedWidth, clampedHeight)
          
          requestPayload = {
            prompt: finalPrompt,
            images: allImages,
            resolution: resolution,
            aspect_ratio: aspectRatio,
            output_format: modelConfig.defaultOutputFormat,
            enable_sync_mode: false,
            enable_base64_output: false
          }
          
          console.log('[WaveSpeed] submit (Nano Banana Pro Edit)', {
            jobId: job.id,
            endpoint: modelConfig.endpoint,
            imagesCount: allImages.length,
            refImagesCount: refUrls.length,
            operationType: refUrls.length > 0 ? 'face-swap' : 'target-only',
            promptLength: finalPrompt ? finalPrompt.length : 0,
            resolution,
            aspectRatio,
            urlPreviews: allImages.map(previewUrl)
          })
        } else {
          // Seedream V4 Edit uses size parameter
          const finalSize = `${clampedWidth}*${clampedHeight}`
          
          requestPayload = {
            prompt: finalPrompt,
            images: allImages,
            size: finalSize,
            enable_sync_mode: false,
            enable_base64_output: false
          }
          
          console.log('[WaveSpeed] submit (Seedream V4 Edit)', {
            jobId: job.id,
            endpoint: modelConfig.endpoint,
            imagesCount: allImages.length,
            refImagesCount: refUrls.length,
            operationType: refUrls.length > 0 ? 'face-swap' : 'target-only',
            promptLength: finalPrompt ? finalPrompt.length : 0,
            size: finalSize,
            urlPreviews: allImages.map(previewUrl)
          })
        }

        // Make the WaveSpeed API call in async mode with retry (network/transient 5xx)
        const submitOnce = () => axios.post(
          `${base}${modelConfig.endpoint}`,
          requestPayload,
          {
            headers: {
              Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 600_000
          }
        )

        let resp
        try {
          resp = await submitOnce()
        } catch (e: any) {
          const retriable = [408, 429, 500, 502, 503, 504].includes(Number(e?.response?.status)) ||
            (e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT')
          if (retriable) {
            console.warn('[WaveSpeed] submit retrying once due to transient error', {
              jobId: job.id,
              status: e?.response?.status,
              code: e?.code,
              message: e?.message,
              endpoint: modelConfig.endpoint
            })
            await new Promise(r => setTimeout(r, 1000))
            resp = await submitOnce()
            console.log('[WaveSpeed] retry successful', { jobId: job.id })
          } else {
            console.error('[WaveSpeed] submit failed with non-retriable error', {
              jobId: job.id,
              status: e?.response?.status,
              code: e?.code,
              message: e?.message,
              endpoint: modelConfig.endpoint
            })
            throw e
          }
        }

        // Unwrap provider response and save request id for polling
        // WaveSpeed API response structure: { code, message, data: { id, status, ... } }
        const responseData = resp?.data?.data
        // Try multiple possible locations for provider ID
        const providerId = responseData?.id 
          || responseData?.request_id 
          || responseData?.requestId 
          || resp?.data?.id 
          || null

        console.log('[WaveSpeed] submitted', {
          jobId: job.id,
          providerId,
          status: responseData?.status,
          responseCode: resp?.data?.code,
          responseMessage: resp?.data?.message,
          responseDataKeys: responseData ? Object.keys(responseData) : [],
          hasResponseData: !!responseData
        })

        // If we got a successful response but no provider ID, mark as failed
        if (!providerId) {
          console.error(`[WaveSpeed] No provider ID returned for job ${job.id}`, {
            responseCode: resp?.data?.code,
            responseMessage: resp?.data?.message,
            responseDataStructure: {
              hasData: !!responseData,
              dataKeys: responseData ? Object.keys(responseData) : [],
              dataId: responseData?.id,
              rootId: resp?.data?.id,
              fullResponse: JSON.stringify(resp?.data).substring(0, 500) // Limit log size
            },
            generationModel: payload.generation_model || DEFAULT_MODEL_ID,
            endpoint: modelConfig.endpoint
          })
          
          // Update job status to failed with detailed error
          await supabase.from('jobs').update({
            status: 'failed',
            error: `No provider request ID returned from WaveSpeed API. Response code: ${resp?.data?.code || 'unknown'}, Message: ${resp?.data?.message || 'none'}`,
            updated_at: new Date().toISOString()
          }).eq('id', job.id)

          // Update row status (model rows or variant rows)
          if (job.row_id) {
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
          } else if (job.variant_row_id) {
            // Update variant row status using database function
            await supabase.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
          }
        } else {
          // Successfully got provider ID - update job with provider_request_id and status
          const updateResult = await supabase.from('jobs').update({
            provider_request_id: providerId,
            status: 'submitted', // Update status to submitted once we have provider ID
            updated_at: new Date().toISOString()
          }).eq('id', job.id).select('id, provider_request_id, status')
          
          if (updateResult.error) {
            console.error('[Dispatch] Failed to update job with provider_request_id', {
              jobId: job.id,
              providerId,
              error: updateResult.error.message,
              errorCode: updateResult.error.code
            })
          } else {
            console.log('[Dispatch] Successfully updated job with provider_request_id', {
              jobId: job.id,
              providerId,
              updatedJob: updateResult.data?.[0]
            })
          }
        }
      } catch (e: any) {
        const providerMessage = e?.response?.data?.error
          ?? e?.response?.data?.message
          ?? e?.response?.data?.detail
          ?? null
        const errMessage = providerMessage || (e?.message ?? 'submit error')

        // Safely extract generation_model from job payload (payload may not be defined if error occurred early)
        const jobPayload = job.request_payload as { generation_model?: string } | null
        const generationModel = jobPayload?.generation_model || DEFAULT_MODEL_ID
        const modelConfig = getWaveSpeedModel(generationModel)
        
        console.error(`Failed to submit job ${job.id}:`, {
          status: e?.response?.status,
          statusText: e?.response?.statusText,
          error: errMessage,
          fullResponseData: e?.response?.data,
          endpoint: modelConfig.endpoint,
          generationModel
        })
        await supabase.from('jobs').update({
          status: 'failed',
          error: errMessage,
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status (model rows or variant rows)
        if (job.row_id) {
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
        } else if (job.variant_row_id) {
          // Update variant row status using database function
          await supabase.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
        }
      }
    }))

    // Try to dispatch more jobs if we still have capacity
    // Note: The atomic function handles capacity checking, so we can safely trigger another dispatch
    // The next dispatch call will atomically check capacity again and only claim if slots are available
    console.log('[Dispatch] complete', {
      processed: claimed.length
    })
    
    // Run cleanup periodically (every 60 seconds, reduced frequency for efficiency)
    const now = Date.now()
    if (now - lastCleanupTime > 60 * 1000) {
      lastCleanupTime = now
      // Trigger cleanup asynchronously (don't wait for it, with timeout)
      fetch(new URL('/api/jobs/cleanup', req.url), { 
        method: 'POST', 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }).catch(() => {}) // Silently ignore - cleanup is best-effort
      console.log('[Dispatch] Periodic cleanup triggered')
    }
    
    if (claimed.length > 0) {
      console.log('[Dispatch] recursive dispatch triggered to check for more jobs')
      // Recursive call to fill remaining slots (but don't wait for it)
      // The atomic function will ensure we don't exceed MAX_CONCURRENCY
      fetch(new URL('/api/dispatch', req.url), { 
        method: 'POST', 
        cache: 'no-store'
      }).catch(e => console.warn('[Dispatch] recursive dispatch failed:', e))
    }

    return NextResponse.json({ ok: true, claimed: claimed.length })
    
  } catch (error) {
    console.error('[Dispatch] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
