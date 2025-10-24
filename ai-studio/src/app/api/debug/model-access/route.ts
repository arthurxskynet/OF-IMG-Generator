import { NextRequest, NextResponse } from 'next/server'
import { createServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  
  if (!modelId) {
    return NextResponse.json({ error: 'Model ID required' }, { status: 400 })
  }

  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check if model exists
    const { data: model, error: modelError } = await supabase
      .from("models")
      .select("*")
      .eq("id", modelId)
      .single()

    // Check user's team memberships
    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id)

    // Check if user owns any teams
    const { data: ownedTeams } = await supabase
      .from("teams")
      .select("id, name")
      .eq("owner_id", user.id)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      model: model || null,
      modelError: modelError?.message || null,
      memberships: memberships || [],
      ownedTeams: ownedTeams || [],
      canAccess: model && (
        model.owner_id === user.id || 
        (model.team_id && memberships?.some(m => m.team_id === model.team_id)) ||
        (model.team_id && ownedTeams?.some(t => t.id === model.team_id))
      )
    })
  } catch (error) {
    console.error("Model access debug error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
