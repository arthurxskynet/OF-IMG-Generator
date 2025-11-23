import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";
import { profileUpdateSchema } from "@/lib/validations";
import { z } from "zod";

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
    // Get profile from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("Failed to fetch profile:", profileError);
    }

    // Get user metadata (includes avatar_url)
    const avatarUrl = user.user_metadata?.avatar_url;
    const fullName = profile?.full_name || user.user_metadata?.full_name || "";

    return NextResponse.json({
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await req.json();
    const validatedData = profileUpdateSchema.parse(body);

    // Update profiles table
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        full_name: validatedData.full_name,
      }, {
        onConflict: "user_id"
      });

    if (profileError) {
      console.error("Failed to update profile:", profileError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    // Update user metadata for consistency
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        full_name: validatedData.full_name,
      }
    });

    if (metadataError) {
      console.error("Failed to update user metadata:", metadataError);
      // Don't fail the request if metadata update fails, profile update succeeded
    }

    return NextResponse.json({
      full_name: validatedData.full_name,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Validation failed",
        details: error.issues
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

