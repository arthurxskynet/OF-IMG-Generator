import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { signPath } from '@/lib/storage'

// Random variation focuses - used to build clear, image-referencing instructions
const VARIATION_FOCUS = [
  'slight change in lighting quality and direction',
  'subtle color palette adjustment',
  'minor camera angle and framing shift',
  'slightly different background blur (depth of field)',
  'gentle saturation and contrast tuning',
  'warmer color temperature',
  'cooler color temperature',
  'small composition tweak while keeping the same scene',
  'softened lighting and shadows',
  'subtle mood and atmosphere shift',
  'very light motion impression without degrading details',
  'minor exposure and highlights adjustment'
]

function buildQuickVariantPrompt(variation: string, refCount: number): string {
  const baseContext =
    refCount > 1
      ? 'Use the provided reference images as the base content.'
      : 'Use the provided reference image as the base content.'

  // Clear, production-ready instruction referencing the image(s)
  return `${baseContext} Generate a new variant that preserves the subject, identity, primary environment, and overall composition. Focus on a ${variation}. Allow only subtle changes such as micro‑pose adjustments, slight accessory or prop repositioning, and gentle light/color shifts. Avoid drastic scene changes; keep camera distance, framing, and key background elements consistent. Output one high‑quality variant.`
}

/**
 * Generate variant image directly using image model (no LLM prompt generation)
 * Creates a random slight variation of the reference images
 */
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
    // Get variant row with images
    const { data: row, error: rowError } = await supabase
      .from('variant_rows')
      .select(`
        *,
        variant_row_images (
          output_path,
          thumbnail_path,
          position,
          source_row_id
        )
      `)
      .eq('id', rowId)
      .eq('user_id', user.id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ 
        error: 'Variant row not found' 
      }, { status: 404 })
    }

    const images = (row as any).variant_row_images || []
    if (images.length === 0) {
      return NextResponse.json({ 
        error: 'No images in this variant row' 
      }, { status: 400 })
    }

    // Sort by position and get image paths
    const sortedImages = images.sort((a: any, b: any) => a.position - b.position)
    const imagePaths = sortedImages.map((img: any) => img.output_path)

    // Require at least 1 image (target-only allowed for Seedream edit)
    if (imagePaths.length < 1) {
      return NextResponse.json({ 
        error: 'Need at least 1 image in the variant row to generate a direct variant' 
      }, { status: 400 })
    }

    // Use all but last as reference images, last as target image (works with 1 image -> target only)
    const refPaths = imagePaths.length > 1 ? imagePaths.slice(0, -1) : []
    const targetPath = imagePaths[imagePaths.length - 1]

    // Pick a random variation focus and build a clear, image-referencing prompt
    const randomVariation = VARIATION_FOCUS[Math.floor(Math.random() * VARIATION_FOCUS.length)]
    const quickPrompt = buildQuickVariantPrompt(randomVariation, refPaths.length)

    console.log('[VariantGenerateDirect] Creating direct variant job', {
      rowId,
      refImagesCount: refPaths.length,
      variation: randomVariation
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
            default_prompt: quickPrompt,
            owner_id: user.id,
            team_id: validTeamId || null,
            size: '4096*4096'
          })
          .select('id, team_id')
          .single()
        
        if (!createModelError && newModel) {
          modelId = newModel.id
          validTeamId = newModel.team_id
          console.log('[VariantGenerateDirect] Created default model for variants', { modelId })
        }
      }
    }

    // Determine output dimensions from model (fallback to parsed size or 4096)
    let width = 4096
    let height = 4096
    if (modelId) {
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
        row_id: null,
        variant_row_id: rowId,
        model_id: modelId,
        team_id: validTeamId || null, // Use validated team_id, or null if none found
        user_id: user.id,
        status: 'queued',
        request_payload: {
          refPaths,
          targetPath,
          prompt: quickPrompt,
          width,
          height,
          variantRowId: rowId
        }
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error('[VariantGenerateDirect] Failed to create job:', jobError)
      return NextResponse.json({ 
        error: 'Failed to create generation job' 
      }, { status: 500 })
    }

    console.log('[VariantGenerateDirect] Job created successfully', {
      jobId: job.id,
      rowId,
      variation: randomVariation
    })

    // Trigger dispatcher asynchronously after response (mirror model flow)
    const dispatchUrl = new URL('/api/dispatch', req.url)
    fetch(dispatchUrl, { 
      method: 'POST', 
      cache: 'no-store',
      headers: { 'x-dispatch-variant-row': rowId }
    }).catch(e => console.warn('[VariantGenerateDirect] dispatcher failed:', e))

    return NextResponse.json({ 
      jobId: job.id,
      status: 'queued',
      variation: randomVariation
    })

  } catch (error) {
    console.error('[VariantGenerateDirect] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

