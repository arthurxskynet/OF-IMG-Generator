import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServer } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

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
    // Verify user has access to the model (or is admin)
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin
    
    if (!hasAccess) {
      const { data: model, error: modelError } = await supabase
        .from('models')
        .select('id, owner_id, team_id')
        .eq('id', modelId)
        .single()
      
      if (modelError || !model) {
        return NextResponse.json({ error: 'Model not found' }, { status: 404 })
      }
      
      // Check access: admin OR (team_id IS NULL AND owner) OR team_member OR team_owner
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
    }
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to model' }, { status: 403 })
    }
    
    // Return active jobs (queued|submitted|running|saving) for this model
    // RLS will further filter to only jobs user has access to
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


