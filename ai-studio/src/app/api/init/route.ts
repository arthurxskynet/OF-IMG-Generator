import { NextRequest, NextResponse } from 'next/server'
import { promptQueueService } from '@/lib/prompt-queue'

/**
 * POST /api/init - Initialize background services
 * This endpoint can be called on application startup to initialize background services
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[Init] Starting background services initialization')
    
    // Start the prompt queue processing service
    promptQueueService.startProcessing()
    
    // Get initial queue stats
    const stats = await promptQueueService.getQueueStats()
    
    console.log('[Init] Background services initialized', { stats })
    
    return NextResponse.json({
      success: true,
      message: 'Background services initialized',
      services: {
        promptQueue: {
          status: 'started',
          stats
        }
      }
    })

  } catch (error) {
    console.error('[Init] Error initializing services:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}

/**
 * GET /api/init - Get initialization status
 */
export async function GET(req: NextRequest) {
  try {
    const stats = await promptQueueService.getQueueStats()
    
    return NextResponse.json({
      success: true,
      services: {
        promptQueue: {
          status: 'running',
          stats
        }
      }
    })

  } catch (error) {
    console.error('[Init] Error getting status:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 })
  }
}
