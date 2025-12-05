import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { createServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchAndSaveToOutputs } from '@/lib/storage'
import { isAdminUser } from '@/lib/admin'
import { categorizeError, categorizeWaveSpeedError, ErrorCategory } from '@/lib/error-categorization'

interface VariantImageInsert {
  variant_row_id: string
  job_id: string
  output_path: string
  thumbnail_path: string | null
  source_row_id: string | null
  position: number
  is_generated: true
  prompt_text: string | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Use admin client for DB access; enforce ownership with explicit check
    const admin = supabaseAdmin
    const { data: job, error: jobFetchError } = await admin.from('jobs').select('*').eq('id', jobId).single()
    
    // Handle job not found (404) - update variant row status if applicable
    if (!job || jobFetchError) {
      console.error('[Poll] Job not found', { 
        jobId, 
        error: jobFetchError?.message,
        code: jobFetchError?.code 
      })
      
      // Try to find if this was a variant row job and update its status
      // We can't query by job_id since job doesn't exist, but we can check variant_rows
      // for any rows that might be stuck in queued/running status
      try {
        // This is a best-effort cleanup - we can't reliably determine which variant_row
        // this job belonged to without the job record, so we'll just return the error
        console.warn('[Poll] Cannot update variant row status - job record missing', { jobId })
      } catch (cleanupError) {
        console.warn('[Poll] Failed to cleanup after job not found', { 
          jobId, 
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) 
        })
      }
      
      return NextResponse.json({ 
        error: 'Job not found', 
        status: 'not_found' 
      }, { status: 404 })
    }
    
    // Check access: admin, owner, or team member
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
      hasAccess = job.user_id === user.id

      if (!hasAccess && job.team_id) {
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', job.team_id)
          .eq('user_id', user.id)
          .single()
        
        if (teamMember) {
          hasAccess = true
        } else {
          const { data: team } = await supabase
            .from('teams')
            .select('owner_id')
            .eq('id', job.team_id)
            .single()
          
          hasAccess = team?.owner_id === user.id
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // If no provider request ID, attempt recovery + stop infinite loops after TTL
    if (!job.provider_request_id) {
      const createdAtMs = job.created_at ? Date.parse(job.created_at) : Date.now()
      const ageSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000))
      
      console.log('[Poll] no provider_request_id', { 
        jobId, 
        status: job.status,
        createdAt: job.created_at,
        ageSec,
        variantRowId: job.variant_row_id,
        rowId: job.row_id,
        error: job.error
      })

      // Best-effort retry: if queued/submitted for >10s, try to trigger dispatch again
      // But only retry periodically to avoid spam (every 20 seconds, reduced frequency)
      // Only retry for queued jobs (submitted jobs should already have provider_request_id)
      if (job.status === 'queued' && ageSec > 10 && ageSec % 20 < 2) {
        try {
          // Fire and forget - don't wait for response to avoid blocking poll
          fetch(new URL('/api/dispatch', req.url), { 
            method: 'POST', 
            cache: 'no-store',
            signal: AbortSignal.timeout(2000) // 2 second timeout
          }).catch(() => {}) // Silently ignore errors
          console.log('[Poll] re-dispatch triggered', { jobId, ageSec })
        } catch (e) {
          // Ignore errors - this is best-effort
        }
      }

      // Aggressive cleanup: fail submitted jobs without provider_request_id after 30 seconds
      // This prevents jobs from getting stuck in submitted status for too long
      if (job.status === 'submitted' && ageSec > 30) {
        const categorizedError = categorizeError(
          { message: 'timeout: submitted without provider request id' },
          { errorMessage: 'timeout: submitted without provider request id' }
        )
        
        console.error('[Poll] Job stuck in submitted status without provider_request_id, failing', {
          jobId: job.id,
          status: job.status,
          ageSec,
          category: categorizedError.category,
          variantRowId: job.variant_row_id,
          rowId: job.row_id,
          requestPayload: job.request_payload
        })
        
        await admin.from('jobs').update({
          status: 'failed',
          error: `${categorizedError.category}: ${categorizedError.message}`,
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status (model rows or variant rows)
        if (job.row_id) {
          const [{ count: remaining }, { count: succeeded }] = await Promise.all([
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .in('status', ['queued', 'running', 'submitted', 'saving']),
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .eq('status', 'succeeded')
          ])

          await admin.from('model_rows').update({
            status: (remaining ?? 0) > 0
              ? 'partial'
              : (succeeded ?? 0) > 0
                ? 'done'
                : 'error'
          }).eq('id', job.row_id)
        } else if (job.variant_row_id) {
          // Update variant row status using database function
          await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
        }

        // Kick dispatcher to move on to next jobs
        try {
          await fetch(new URL('/api/dispatch', req.url), { method: 'POST', cache: 'no-store' })
        } catch {}

        return NextResponse.json({ status: 'failed', error: 'timeout: submitted without provider request id' })
      }

      // Hard timeout: fail the job after 60 seconds (reduced from 90) without a provider id
      if (['queued', 'saving'].includes(job.status) && ageSec > 60) {
        const categorizedError = categorizeError(
          { message: 'timeout: no provider request id' },
          { errorMessage: 'timeout: no provider request id' }
        )
        
        console.error('[Poll] Job stuck without provider_request_id, failing', {
          jobId: job.id,
          status: job.status,
          ageSec,
          category: categorizedError.category,
          variantRowId: job.variant_row_id,
          rowId: job.row_id,
          requestPayload: job.request_payload
        })
        
        await admin.from('jobs').update({
          status: 'failed',
          error: `${categorizedError.category}: ${categorizedError.message}`,
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status (model rows or variant rows)
        if (job.row_id) {
          const [{ count: remaining }, { count: succeeded }] = await Promise.all([
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .in('status', ['queued', 'running', 'submitted', 'saving']),
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .eq('status', 'succeeded')
          ])

          await admin.from('model_rows').update({
            status: (remaining ?? 0) > 0
              ? 'partial'
              : (succeeded ?? 0) > 0
                ? 'done'
                : 'error'
          }).eq('id', job.row_id)
        } else if (job.variant_row_id) {
          // Update variant row status using database function
          await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
        }

        // Kick dispatcher to move on to next jobs
        try {
          await fetch(new URL('/api/dispatch', req.url), { method: 'POST', cache: 'no-store' })
        } catch {}

        return NextResponse.json({ status: 'failed', error: 'timeout: no provider request id' })
      }

      // Additional cleanup: fail very old queued jobs (2+ minutes) immediately
      if (job.status === 'queued' && ageSec > 120) {
        const categorizedError = categorizeError(
          { message: 'timeout: stuck in queue too long' },
          { errorMessage: 'timeout: stuck in queue too long' }
        )
        
        console.error('[Poll] Job stuck in queue too long, failing', {
          jobId: job.id,
          status: job.status,
          ageSec,
          category: categorizedError.category,
          variantRowId: job.variant_row_id,
          rowId: job.row_id
        })
        
        await admin.from('jobs').update({
          status: 'failed',
          error: `${categorizedError.category}: ${categorizedError.message}`,
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status (model rows or variant rows)
        if (job.row_id) {
          const [{ count: remaining2 }, { count: succeeded2 }] = await Promise.all([
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .in('status', ['queued', 'running', 'submitted', 'saving']),
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .eq('status', 'succeeded')
          ])

          await admin.from('model_rows').update({
            status: (remaining2 ?? 0) > 0
              ? 'partial'
              : (succeeded2 ?? 0) > 0
                ? 'done'
                : 'error'
          }).eq('id', job.row_id)
        } else if (job.variant_row_id) {
          // Update variant row status using database function
          await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
        }

        return NextResponse.json({ status: 'failed', error: 'timeout: stuck in queue too long' })
      }

      // Timeout for jobs stuck in "saving" status (10 minutes)
      const updatedAtMs = job.updated_at ? Date.parse(job.updated_at) : Date.now()
      const timeSinceUpdateSec = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000))
      if (job.status === 'saving' && timeSinceUpdateSec > 600) {
        const categorizedError = categorizeError(
          { message: 'timeout: stuck in saving' },
          { errorMessage: 'timeout: stuck in saving' }
        )
        
        console.error('[Poll] Job stuck in saving status too long, failing', {
          jobId: job.id,
          status: job.status,
          timeSinceUpdateSec,
          category: categorizedError.category,
          variantRowId: job.variant_row_id,
          rowId: job.row_id,
          providerRequestId: job.provider_request_id
        })
        
        await admin.from('jobs').update({
          status: 'failed',
          error: `${categorizedError.category}: ${categorizedError.message}`,
          updated_at: new Date().toISOString()
        }).eq('id', job.id)

        // Update row status (model rows or variant rows)
        if (job.row_id) {
          const [{ count: remaining3 }, { count: succeeded3 }] = await Promise.all([
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .in('status', ['queued', 'running', 'submitted', 'saving']),
            admin.from('jobs')
              .select('*', { count: 'exact', head: true })
              .eq('row_id', job.row_id)
              .eq('status', 'succeeded')
          ])

          await admin.from('model_rows').update({
            status: (remaining3 ?? 0) > 0
              ? 'partial'
              : (succeeded3 ?? 0) > 0
                ? 'done'
                : 'error'
          }).eq('id', job.row_id)
        } else if (job.variant_row_id) {
          // Update variant row status using database function
          await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
        }

        return NextResponse.json({ status: 'failed', error: 'timeout: stuck in saving' })
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
        console.log('[Poll] Job status transition: submitted -> running', {
          jobId: job.id,
          previousStatus: job.status,
          providerRequestId: job.provider_request_id,
          variantRowId: job.variant_row_id,
          rowId: job.row_id
        })
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
      console.log('[Poll] Attempting to claim job for processing', {
        jobId: job.id,
        currentStatus: job.status,
        providerRequestId: job.provider_request_id,
        variantRowId: job.variant_row_id,
        rowId: job.row_id
      })
      
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
          claimError: claimError?.message,
          claimResult: claimResult
        })
        return NextResponse.json({ status: 'succeeded', step: 'done' })
      }
      
      console.log('[Poll] Job successfully claimed for processing', {
        jobId: job.id,
        claimedStatus: claimResult[0]?.status,
        variantRowId: job.variant_row_id,
        rowId: job.row_id
      })

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
      // For variant rows, check variant_row_images; for model rows, check generated_images
      if (job.variant_row_id) {
        // Variant row duplicate check - now using job_id like model rows
        const { data: existingImages } = await admin
          .from('variant_row_images')
          .select('id, output_path')
          .eq('job_id', job.id)

        const existingPaths = new Set((existingImages || []).map(img => img.output_path))
        if (existingPaths.size > 0) {
          console.log('[Poll] Images already exist for variant job', { 
            jobId: job.id, 
            variantRowId: job.variant_row_id,
            existingCount: existingPaths.size 
          })
          // Skip to marking job as succeeded
          await admin.from('jobs').update({ 
            status: 'succeeded', 
            updated_at: new Date().toISOString() 
          }).eq('id', job.id)
          return NextResponse.json({ status: 'succeeded', step: 'done' })
        }
        
        console.log('[Poll] Processing variant row job', { 
          jobId: job.id, 
          variantRowId: job.variant_row_id,
          urlsCount: urls.length
        })
      } else {
        // Model row duplicate check
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
      }

      // No need for additional status check since we atomically transitioned to 'saving'
      
      // Early URL deduplication check - prevent duplicates (model rows only)
      if (urls.length > 0 && job.row_id) {
        const remoteUrl = urls[0]
        const { data: existingRemoteUrl } = await admin
          .from('generated_images')
          .select('id, output_url')
          .eq('row_id', job.row_id)
          .limit(10)
        const isDuplicate = existingRemoteUrl?.some(img => {
          const existingFilename = img.output_url.split('/').pop()?.split('?')[0]
          const newFilename = remoteUrl.split('/').pop()?.split('?')[0]
          return existingFilename && newFilename && existingFilename.includes(newFilename.split('-')[0])
        })
        if (isDuplicate) {
          console.log('[Poll] Remote URL already processed for this row', { jobId: job.id, rowId: job.row_id })
          await admin.from('jobs').update({ status: 'succeeded', updated_at: new Date().toISOString() }).eq('id', job.id)
          return NextResponse.json({ status: 'succeeded', step: 'done' })
        }
      }
      
      const inserts = []
      const variantInserts: VariantImageInsert[] = []
      let variantStartPosition = 0
      
      // If this is a variant row job, determine the starting position for new images
      // Also get existing paths to check for duplicates
      let existingVariantPaths = new Set<string>()
      if (job.variant_row_id) {
        const { data: existingVariantImages } = await admin
          .from('variant_row_images')
          .select('position, output_path')
          .eq('variant_row_id', job.variant_row_id)
          .order('position', { ascending: false })
        
        if (existingVariantImages && existingVariantImages.length > 0) {
          variantStartPosition = Number(existingVariantImages[0].position) + 1
          // Build set of existing paths for duplicate checking
          existingVariantPaths = new Set(existingVariantImages.map(img => img.output_path))
        }
      }
      
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i]
        const uploaded = await fetchAndSaveToOutputs(u, job.user_id)
        
        if (job.variant_row_id) {
          // Check if this specific path already exists (duplicate check)
          if (existingVariantPaths.has(uploaded.objectPath)) {
            console.log('[Poll] Skipping duplicate variant image', {
              jobId: job.id,
              variantRowId: job.variant_row_id,
              outputPath: uploaded.objectPath
            })
            continue // Skip this image, but continue processing others
          }
          
          // Defensive check: ensure is_generated is always true for variant images
          const variantInsert: VariantImageInsert = {
            variant_row_id: job.variant_row_id,
            job_id: job.id, // Track which job created this image
            output_path: uploaded.objectPath,
            thumbnail_path: uploaded.thumbnailPath || null,
            source_row_id: job.row_id || null,
            position: variantStartPosition + variantInserts.length, // Use current insert count for position
            is_generated: true as const, // Explicitly set to true, never null/undefined
            prompt_text: job?.request_payload?.prompt ?? null // Save the prompt used to generate this image
          }
          
          // Validate before pushing
          if (variantInsert.is_generated !== true) {
            console.error('[Poll] CRITICAL: is_generated is not true for variant image', {
              jobId: job.id,
              variantRowId: job.variant_row_id,
              isGenerated: variantInsert.is_generated
            })
            throw new Error('Variant image must have is_generated=true')
          }
          
          variantInserts.push(variantInsert)
          // Add to existing paths set to prevent duplicates within this batch
          existingVariantPaths.add(uploaded.objectPath)
          console.log('[Poll] Prepared variant image insert', {
            jobId: job.id,
            variantRowId: job.variant_row_id,
            outputPath: uploaded.objectPath,
            isGenerated: variantInsert.is_generated,
            position: variantInsert.position,
            jobIdInInsert: variantInsert.job_id
          })
        } else {
        inserts.push({
          job_id: job.id,
          row_id: job.row_id,
          model_id: job.model_id,
          team_id: job.team_id,
          user_id: job.user_id,
          output_url: uploaded.objectPath,
          thumbnail_url: uploaded.thumbnailPath || null,
          is_upscaled: false,
          prompt_text: job?.request_payload?.prompt ?? null
        })
      }
      }
      
      if (variantInserts.length) {
        // Final validation: ensure all variant inserts have is_generated=true
        const invalidInserts = variantInserts.filter(insert => insert.is_generated !== true)
        if (invalidInserts.length > 0) {
          console.error('[Poll] CRITICAL: Found variant inserts without is_generated=true', {
            jobId: job.id,
            invalidCount: invalidInserts.length,
            totalCount: variantInserts.length
          })
          throw new Error('All variant images must have is_generated=true')
        }
        
        // Save into variant_row_images
        try {
          const insertResult = await admin.from('variant_row_images').insert(variantInserts).select('id, is_generated, job_id')
          console.log('[Poll] Saved variant images with is_generated=true', { 
            jobId: job.id, 
            variantRowId: job.variant_row_id,
            count: variantInserts.length,
            insertedIds: insertResult?.data?.map(img => img.id),
            verifiedFlags: insertResult?.data?.map(img => img.is_generated),
            verifiedJobIds: insertResult?.data?.map(img => img.job_id)
          })
          
          // Verify inserted images have correct flag
          if (insertResult?.data) {
            const incorrectFlags = insertResult.data.filter(img => img.is_generated !== true)
            if (incorrectFlags.length > 0) {
              console.error('[Poll] WARNING: Some inserted variant images have incorrect is_generated flag', {
                jobId: job.id,
                incorrectCount: incorrectFlags.length,
                incorrectIds: incorrectFlags.map(img => img.id)
              })
            }
          }
        } catch (error: any) {
          console.error('[Poll] Failed to save variant images', { 
            jobId: job.id, 
            variantRowId: job.variant_row_id,
            error: error?.message,
            variantInserts: variantInserts.map(insert => ({
              variant_row_id: insert.variant_row_id,
              is_generated: insert.is_generated,
              position: insert.position
            }))
          })
          throw error
        }
      } else if (inserts.length) {
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

      const { error: updateError } = await admin.from('jobs').update({ 
        status: 'succeeded', 
        updated_at: new Date().toISOString() 
      }).eq('id', job.id)
      
      if (updateError) {
        console.error('[Poll] Failed to update job status to succeeded', {
          jobId: job.id,
          error: updateError.message,
          errorCode: updateError.code
        })
      } else {
        console.log('[Poll] Job status transition: saving -> succeeded', {
          jobId: job.id,
          variantRowId: job.variant_row_id,
          rowId: job.row_id,
          imagesProcessed: variantInserts.length + inserts.length
        })
      }

      // Update row status (model rows or variant rows)
      if (job.row_id) {
        const { count: remaining } = await admin.from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('row_id', job.row_id)
          .in('status', ['queued','submitted','running','saving'])
        await admin.from('model_rows').update({ 
          status: (remaining ?? 0) > 0 ? 'partial' : 'done' 
        }).eq('id', job.row_id)
      } else if (job.variant_row_id) {
        // Update variant row status using database function
        await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
      }

      // Try dispatching more if capacity available (hard cap 3)
      await fetch(new URL('/api/dispatch', req.url), { 
        method: 'POST', 
        headers: { 'x-dispatch-model': job.model_id } 
      })

      return NextResponse.json({ status: 'succeeded', step: 'done' })
    }

    // Failed
    const failureError = responseData?.error ?? resp?.data?.message ?? 'provider failed'
    const categorizedError = categorizeWaveSpeedError(resp?.data || responseData, {
      message: failureError,
      response: resp
    })
    
    console.error('[Poll] Job failed at provider', {
      jobId: job.id,
      providerRequestId: job.provider_request_id,
      category: categorizedError.category,
      error: categorizedError.message,
      responseStatus: responseData?.status,
      variantRowId: job.variant_row_id,
      rowId: job.row_id,
      details: categorizedError.details
    })
    
    await admin.from('jobs').update({
      status: 'failed',
      error: `${categorizedError.category}: ${categorizedError.message}`,
      updated_at: new Date().toISOString()
    }).eq('id', job.id)

    // Update row status (model rows or variant rows)
    if (job.row_id) {
      const [{ count: remaining }, { count: succeeded }] = await Promise.all([
        admin.from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('row_id', job.row_id)
          .in('status', ['queued', 'running', 'submitted', 'saving']),
        admin.from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('row_id', job.row_id)
          .eq('status', 'succeeded')
      ])

      await admin.from('model_rows').update({
        status: (remaining ?? 0) > 0
          ? 'partial'
          : (succeeded ?? 0) > 0
            ? 'done'
            : 'error'
      }).eq('id', job.row_id)
    } else if (job.variant_row_id) {
      // Update variant row status using database function
      await admin.rpc('update_variant_row_status', { p_variant_row_id: job.variant_row_id })
    }

    // Free up slot and dispatch next
    await fetch(new URL('/api/dispatch', req.url), { 
      method: 'POST', 
      headers: { 'x-dispatch-model': job.model_id } 
    })
    
    return NextResponse.json({ status: 'failed', error: responseData?.error ?? 'failed', step: 'failed' })

  } catch (e: any) {
    // Categorize the error for logging
    const categorizedError = categorizeError(e, {
      httpStatus: e?.response?.status,
      errorMessage: e?.message,
      responseData: e?.response?.data
    })
    
    // Transient errors -> keep as running, don't change status
    console.error('Job polling error:', { 
      category: categorizedError.category,
      message: categorizedError.message, 
      status: e?.response?.status, 
      data: e?.response?.data,
      details: categorizedError.details
    })
    return NextResponse.json({ status: 'running', step: 'running' })
  }
}


