import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { promptQueueService } from '@/lib/prompt-queue'
import { PromptQueueRequestSchema } from '@/types/prompt-queue'

/**
 * POST /api/prompt/queue - Enqueue a prompt generation request
 */
export async function POST(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { rowId, refUrls, targetUrl, priority } = PromptQueueRequestSchema.parse(body)

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

    // Enqueue the prompt generation
    const promptJobId = await promptQueueService.enqueuePromptGeneration(
      rowId,
      model.id,
      user.id,
      refUrls || [],
      targetUrl,
      priority
    )

    // Get queue stats for estimated wait time
    const queueStats = await promptQueueService.getQueueStats()

    return NextResponse.json({
      promptJobId,
      status: 'queued',
      estimatedWaitTime: queueStats.estimatedWaitTime
    })

  } catch (error) {
    console.error('[PromptQueue] Error:', error)
    
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

/**
 * GET /api/prompt/queue - Get queue statistics
 */
export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const queueStats = await promptQueueService.getQueueStats()
    return NextResponse.json(queueStats)

  } catch (error) {
    console.error('[PromptQueue] Error getting stats:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
