import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

/**
 * GET /api/variants/jobs/active
 * Returns active variant jobs (queued|submitted|running|saving) for the current user
 */
export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Return active jobs where variant_row_id is not null
    // Filter out failed jobs that have no provider_request_id (old backlogged failures)
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, variant_row_id, status, created_at, provider_request_id')
      .eq('user_id', user.id)
      .not('variant_row_id', 'is', null)
      .in('status', ['queued','submitted','running','saving'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[VariantActiveJobs] query error', error)
      return NextResponse.json({ error: 'Query error' }, { status: 500 })
    }

    // Filter out failed jobs without provider_request_id (old backlog)
    // These are jobs that failed before being submitted to the provider
    const activeJobs = (jobs ?? []).filter(j => {
      // Only include jobs that are actually active (not failed)
      if (j.status === 'failed' && !j.provider_request_id) {
        // This is an old backlogged failure, exclude it
        return false
      }
      return true
    })

    return NextResponse.json({ jobs: activeJobs.map(j => ({
      job_id: j.id,
      variant_row_id: j.variant_row_id,
      status: j.status,
      created_at: j.created_at
    })) })
  } catch (e) {
    console.error('[VariantActiveJobs] error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

