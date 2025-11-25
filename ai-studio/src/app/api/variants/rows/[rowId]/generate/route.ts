import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'
import { getRemoteImageDimensions, computeMaxQualityDimensionsForRatio } from '@/lib/server-utils'
import { isAdminUser } from '@/lib/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get variant row with images and prompt
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select(`
        *,
        variant_row_images (
          output_path,
          thumbnail_path,
          position,
          source_row_id,
          is_generated
        )
      `)
      .eq('id', rowId)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    // Check access: if model_id is set, verify model access; otherwise check user_id
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
      if (row.model_id) {
        const { data: model, error: modelError } = await supabase
          .from('models')
          .select('id, owner_id, team_id')
          .eq('id', row.model_id)
          .single()

        if (modelError || !model) {
          return NextResponse.json({ 
            error: 'Model not found' 
          }, { status: 404 })
        }

        if (model.team_id === null) {
          hasAccess = model.owner_id === user.id
        } else {
          hasAccess = model.owner_id === user.id

          if (!hasAccess) {
            const { data: teamMember } = await supabase
              .from('team_members')
              .select('id')
              .eq('team_id', model.team_id)
              .eq('user_id', user.id)
              .single()
            
            if (teamMember) {
              hasAccess = true
            } else {
              const { data: team } = await supabase
                .from('teams')
                .select('owner_id')
                .eq('id', model.team_id)
                .single()
              
              hasAccess = team?.owner_id === user.id
            }
          }
        }
      } else {
        hasAccess = row.user_id === user.id
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied to variant row' 
      }, { status: 403 })
    }

    if (!row.prompt) {
      return NextResponse.json({ 
        error: 'No prompt in this variant row. Generate a prompt first.' 
      }, { status: 400 })
    }

    const images = (row as any).variant_row_images || []
    if (images.length === 0) {
      return NextResponse.json({ 
        error: 'No images in this variant row' 
      }, { status: 400 })
    }

    // Sort by position for consistent ordering
    const sortedImages = images.sort((a: any, b: any) => a.position - b.position)
    
    // Identify reference images by is_generated flag (not by position)
    // Reference images: is_generated !== true (includes false, null, undefined)
    const referenceImages = sortedImages.filter((img: any) => img.is_generated !== true)
    const generatedImages = sortedImages.filter((img: any) => img.is_generated === true)
    
    // Require at least 1 reference image (target-only allowed for Seedream edit)
    if (referenceImages.length === 0) {
      return NextResponse.json({ 
        error: 'Need at least 1 reference image in the variant row to generate a new variant' 
      }, { status: 400 })
    }

    // For Seedream API: use all but last reference image as refs, last reference as target
    // This maintains backward compatibility with existing behavior
    const refPaths = referenceImages.length > 1 ? referenceImages.slice(0, -1).map((img: any) => img.output_path) : []
    const targetPath = referenceImages[referenceImages.length - 1].output_path

    console.log('[VariantGenerate] Creating job', {
      rowId,
      referenceImagesCount: referenceImages.length,
      refImagesCount: refPaths.length,
      generatedImagesCount: generatedImages.length,
      matchTargetRatio: row.match_target_ratio || false,
      prompt: row.prompt.substring(0, 100) + '...'
    })

    // Resolve a real model_id (required FK) and get its team_id
    let modelId: string | null = null
    let validTeamId: string | null = null
    
    {
      // Prefer deriving model from the source model_row of any image (most accurate linkage)
      const sourceRowId = sortedImages.find((img: any) => !!img.source_row_id)?.source_row_id
      if (sourceRowId) {
        const { data: sourceRow } = await supabase
          .from('model_rows')
          .select('model_id')
          .eq('id', sourceRowId)
          .single()
        if (sourceRow?.model_id) {
          modelId = sourceRow.model_id
          const { data: modelRowModel } = await supabase
            .from('models')
            .select('id, team_id')
            .eq('id', modelId)
            .single()
          if (modelRowModel) {
            validTeamId = modelRowModel.team_id
          }
        }
      }
      
      // First try to get a model from user's team memberships
      if (!modelId) {
        const { data: memberships } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .limit(1)
        
        if (memberships && memberships.length > 0) {
          const teamId = memberships[0].team_id
          const { data: teamModels } = await supabase
            .from('models')
            .select('id, team_id')
            .eq('team_id', teamId)
            .limit(1)
          
          if (teamModels && teamModels.length > 0) {
            modelId = teamModels[0].id
            validTeamId = teamModels[0].team_id
          }
        }
      }
      
      // Fallback to user's owned models
      if (!modelId) {
        const { data: userModels } = await supabase
          .from('models')
          .select('id, team_id')
          .eq('owner_id', user.id)
          .limit(1)
        
        if (userModels && userModels.length > 0) {
          modelId = userModels[0].id
          validTeamId = userModels[0].team_id
        }
      }
      
      // Last resort: get team_id from user's owned teams
      if (!validTeamId) {
        const { data: ownedTeams } = await supabase
          .from('teams')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1)
        
        if (ownedTeams && ownedTeams.length > 0) {
          validTeamId = ownedTeams[0].id
        }
      }
      
      // If still no model found, auto-create a minimal default model owned by the user
      if (!modelId) {
        const defaultName = 'Variants Default'
        const { data: newModel, error: createModelError } = await supabase
          .from('models')
          .insert({
            name: defaultName,
            default_prompt: row.prompt || 'High quality photograph, detailed, cinematic lighting',
            owner_id: user.id,
            team_id: validTeamId || null,
            size: '4096*4096'
          })
          .select('id, team_id')
          .single()
        
        if (!createModelError && newModel) {
          modelId = newModel.id
          validTeamId = newModel.team_id
          console.log('[VariantGenerate] Created default model for variants', { modelId })
        }
      }
    }

    // Determine output dimensions
    // Priority: match_target_ratio (if enabled) > variant row > model > default
    let width = 4096
    let height = 4096
    let usedReferenceRatio = false
    
    // If match_target_ratio is enabled, use first reference image dimensions to override controls
    if (row.match_target_ratio) {
      // Validate that we have at least one reference image
      if (referenceImages.length === 0) {
        return NextResponse.json({ 
          error: 'Match target ratio is enabled but no reference images found. Add reference images first.' 
        }, { status: 400 })
      }
      
      // Use the first reference image (by position) for dimension matching
      const firstReferenceImage = referenceImages[0]
      const referenceImagePath = firstReferenceImage.output_path
      
      if (referenceImagePath) {
        try {
          // Short-lived signed URL for probing dimensions
          const signedRefUrl = await signPath(referenceImagePath, 120)
          const dims = await getRemoteImageDimensions(signedRefUrl)
          
          // Use reference image dimensions as baseline for max quality computation
          // Start with a high-quality baseline (4096) to compute max quality dimensions
          // This completely overrides variant row output_width/output_height values
          const computed = computeMaxQualityDimensionsForRatio(
            4096,  // Use high-quality baseline
            4096,  // Use high-quality baseline
            dims.width,
            dims.height
          )
          width = computed.width
          height = computed.height
          usedReferenceRatio = true
          
          console.log('[VariantGenerate] Using reference image ratio override (toggle enabled)', {
            rowId,
            matchTargetRatio: true,
            referenceImagePath,
            referenceDims: dims,
            computedWidth: width,
            computedHeight: height,
            overridesVariantRowDimensions: true
          })
        } catch (e: any) {
          console.warn('[VariantGenerate] Failed to probe reference image dimensions; falling back to variant/model dimensions', {
            rowId,
            referenceImagePath,
            error: e?.message
          })
          // Fall through to variant row / model dimensions if probe fails
        }
      }
    }
    
    // Only use variant row / model dimensions if match_target_ratio is disabled or failed
    if (!usedReferenceRatio) {
      // First, try to get dimensions from variant row
      const variantWidth = Number(row.output_width) || 0
      const variantHeight = Number(row.output_height) || 0
      if (variantWidth > 0 && variantHeight > 0) {
        width = variantWidth
        height = variantHeight
      } else if (modelId) {
        // Fallback to model dimensions if variant row doesn't have dimensions set
        try {
          const { data: modelDims } = await supabase
            .from('models')
            .select('output_width, output_height, size')
            .eq('id', modelId)
            .single()
          const ow = Number((modelDims as any)?.output_width) || 0
          const oh = Number((modelDims as any)?.output_height) || 0
          if (ow > 0 && oh > 0) {
            width = ow
            height = oh
          } else if ((modelDims as any)?.size?.includes('*')) {
            const [wStr, hStr] = (modelDims as any).size.split('*')
            const pw = Number(wStr)
            const ph = Number(hStr)
            if (pw > 0 && ph > 0) {
              width = pw
              height = ph
            }
          }
        } catch {}
      }
    }

    if (!modelId) {
      return NextResponse.json({
        error: 'No available model found to attach job. Create a model first.'
      }, { status: 400 })
    }

    // For variant rows, use variant_row_id instead of row_id
    // Use validTeamId from model/team, not from variant row (which might be invalid)
    // team_id is nullable, so we can set it to null if no valid team found
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        row_id: null, // Variant jobs don't have model_rows
        variant_row_id: rowId, // Use variant_row_id for variant rows
        model_id: modelId,
        team_id: validTeamId || null, // Use validated team_id, or null if none found
        user_id: user.id,
        status: 'queued',
        request_payload: {
          refPaths,
          targetPath,
          prompt: row.prompt,
          width,
          height,
          variantRowId: rowId // Also store in payload for reference
        }
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error('[VariantGenerate] Failed to create job:', jobError)
      return NextResponse.json({ 
        error: 'Failed to create generation job' 
      }, { status: 500 })
    }

    console.log('[VariantGenerate] Job created successfully', {
      jobId: job.id,
      rowId
    })

    // Trigger dispatcher asynchronously after response (mirror model flow)
    const dispatchUrl = new URL('/api/dispatch', req.url)
    fetch(dispatchUrl, { 
      method: 'POST', 
      cache: 'no-store',
      headers: { 'x-dispatch-variant-row': rowId }
    }).catch(e => console.warn('[VariantGenerate] dispatcher failed:', e))

    return NextResponse.json({ 
      jobId: job.id,
      status: 'queued'
    })

  } catch (error) {
    console.error('[VariantGenerate] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

