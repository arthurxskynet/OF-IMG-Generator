import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  const okUrl = !!url && /^https?:\/\//.test(url)
  const okAnon = !!anon && anon.length > 100 // Supabase keys are long
  const okService = !!service && service.length > 100
  
  // Extract project ID from URL for validation
  const projectId = url ? url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null
  
  return NextResponse.json({
    okUrl,
    okAnon,
    okService,
    urlPreview: url ? url.replace(/(https?:\/\/)(.{3}).+?(\..+)/, '$1$2***$3') : null,
    anonPreview: anon ? `${anon.slice(0,6)}...${anon.slice(-4)}` : null,
    servicePreview: service ? `${service.slice(0,6)}...${service.slice(-4)}` : null,
    projectId: projectId,
    keysLookValid: okUrl && okAnon && okService,
    fallbacksUsed: {
      url: !!process.env.SUPABASE_URL,
      anon: !!process.env.SUPABASE_ANON_KEY
    }
  })
}



