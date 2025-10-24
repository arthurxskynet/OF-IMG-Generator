import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServer } from '@/lib/supabase-server'

const QuerySchema = z.object({
  modelId: z.string().uuid()
})

export async function GET(req: NextRequest) {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({ modelId: url.searchParams.get('modelId') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid modelId' }, { status: 400 })
  }

  const modelId = parsed.data.modelId

  try {
    // Return active jobs (queued|submitted|running|saving) for this model
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, row_id, status, created_at')
      .eq('model_id', modelId)
      .in('status', ['queued','submitted','running','saving'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[ActiveJobs] query error', error)
      return NextResponse.json({ error: 'Query error' }, { status: 500 })
    }

    return NextResponse.json({ jobs: (jobs ?? []).map(j => ({
      job_id: j.id,
      row_id: j.row_id,
      status: j.status,
      created_at: j.created_at
    })) })
  } catch (e) {
    console.error('[ActiveJobs] error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


