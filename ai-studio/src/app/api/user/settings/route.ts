import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const UpdateSettingsSchema = z.object({
  tutorial_enabled: z.boolean()
});

export async function GET() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch user settings, default to false if not found
    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("tutorial_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found", which is fine
      console.error("Failed to fetch user settings:", error);
      return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }

    return NextResponse.json({ 
      tutorial_enabled: settings?.tutorial_enabled ?? false 
    });
  } catch (error) {
    console.error("Settings GET error:", error);
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
    const body = await req.json();
    const validatedData = UpdateSettingsSchema.parse(body);

    // Upsert user settings
    const { data: settings, error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        tutorial_enabled: validatedData.tutorial_enabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to update user settings:", error);
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }

    return NextResponse.json({ 
      tutorial_enabled: settings.tutorial_enabled 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Settings POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

