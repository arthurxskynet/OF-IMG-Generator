import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { ensureUserOnboarding } from "@/lib/onboarding";

export const runtime = "nodejs";

const CreateModelSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  default_prompt: z.string().min(3, "Default prompt must be at least 3 characters"),
  default_ref_headshot_path: z.string().min(1, "Headshot image is required"),
  requests_default: z.number().int().min(1).max(50).default(6),
  size: z.string().default("2227*3183")
});

export async function GET() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Ensure user onboarding
    await ensureUserOnboarding(user.id);

    // Fetch models accessible to the user (RLS handles permissions)
    const { data: models, error } = await supabase
      .from("models")
      .select("id, name, default_prompt, default_ref_headshot_url, requests_default, size, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch models:", error);
      return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
    }

    return NextResponse.json({ data: models || [] });
  } catch (error) {
    console.error("Models GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Ensure user onboarding
    await ensureUserOnboarding(user.id);

    const body = await req.json();
    const validatedData = CreateModelSchema.parse(body);

    // Get user's default team
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const teamId = membership?.team_id || null;
    
    console.log("Creating model for user:", user.id, "with team:", teamId);

    // Create the model - set team_id to null to ensure owner can always access
    const { data: model, error } = await supabase
      .from("models")
      .insert({
        name: validatedData.name,
        default_prompt: validatedData.default_prompt,
        default_ref_headshot_url: validatedData.default_ref_headshot_path,
        requests_default: validatedData.requests_default,
        size: validatedData.size,
        owner_id: user.id,
        team_id: null // Set to null to ensure owner can always access via RLS policy
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create model:", error);
      return NextResponse.json({ error: "Failed to create model" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, model });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Models POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


