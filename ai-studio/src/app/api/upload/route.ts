import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Placeholder: sign upload URL to Supabase Storage
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ signedUrl: null, body });
}


