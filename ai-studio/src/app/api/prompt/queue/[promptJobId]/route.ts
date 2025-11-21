import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'
import { promptQueueService } from '@/lib/prompt-queue'

/**
 * GET /api/prompt/queue/[promptJobId] - Get prompt generation status
 */
export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ promptJobId: string }> }
) {
  const { promptJobId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const promptJob = await promptQueueService.getPromptStatus(promptJobId)
    
    if (!promptJob) {
      return NextResponse.json({ error: 'Prompt job not found' }, { status: 404 })
    }

    // Verify user owns this prompt job
    if (promptJob.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      id: promptJob.id,
      status: promptJob.status,
      generatedPrompt: promptJob.generated_prompt,
      enhancedPrompt: promptJob.enhanced_prompt,
      existingPrompt: promptJob.existing_prompt,
      userInstructions: promptJob.user_instructions,
      operation: promptJob.operation,
      error: promptJob.error,
      retryCount: promptJob.retry_count,
      maxRetries: promptJob.max_retries,
      priority: promptJob.priority,
      createdAt: promptJob.created_at,
      startedAt: promptJob.started_at,
      completedAt: promptJob.completed_at
    })

  } catch (error) {
    console.error('[PromptQueue] Error getting status:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * DELETE /api/prompt/queue/[promptJobId] - Cancel a prompt generation job
 */
export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ promptJobId: string }> }
) {
  const { promptJobId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Verify user owns this prompt job
    const promptJob = await promptQueueService.getPromptStatus(promptJobId)
    
    if (!promptJob) {
      return NextResponse.json({ error: 'Prompt job not found' }, { status: 404 })
    }

    if (promptJob.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only allow cancellation of queued or processing jobs
    if (!['queued', 'processing'].includes(promptJob.status)) {
      return NextResponse.json({ 
        error: 'Cannot cancel completed or failed jobs' 
      }, { status: 400 })
    }

    await promptQueueService.cancelPromptJob(promptJobId)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[PromptQueue] Error cancelling job:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
