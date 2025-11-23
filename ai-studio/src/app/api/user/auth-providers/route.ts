import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    // Get user identities (connected providers)
    const { data: { user: fullUser }, error: userError } = await supabase.auth.getUser();

    if (userError || !fullUser) {
      return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    // Get identities from auth.identities (requires admin access, so we'll use user metadata)
    // For now, we'll return the email provider since that's what we support
    const providers = [
      {
        id: "email",
        type: "email",
        email: user.email,
        verified: user.email_confirmed_at !== null,
      }
    ];

    return NextResponse.json({
      providers,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Auth providers GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

