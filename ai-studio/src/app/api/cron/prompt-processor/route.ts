import { NextRequest, NextResponse } from 'next/server'
import { promptQueueService } from '@/lib/prompt-queue'

/**
 * POST /api/cron/prompt-processor - Background processor for prompt generation queue
 * This endpoint can be called by a cron job or triggered manually to process the queue
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[PromptProcessor] Starting prompt queue processing')
    
    // Start the processing service if not already running
    promptQueueService.startProcessing()
    
    // Get current queue stats
    const stats = await promptQueueService.getQueueStats()
    
    console.log('[PromptProcessor] Queue stats:', stats)
    
    return NextResponse.json({
      success: true,
      message: 'Prompt queue processing started',
      stats
    })

  } catch (error) {
    console.error('[PromptProcessor] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * GET /api/cron/prompt-processor - Get queue status and statistics
 */
export async function GET(req: NextRequest) {
  try {
    const stats = await promptQueueService.getQueueStats()
    
    return NextResponse.json({
      success: true,
      stats
    })

  } catch (error) {
    console.error('[PromptProcessor] Error getting stats:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
