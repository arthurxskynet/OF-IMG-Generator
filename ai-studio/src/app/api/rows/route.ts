import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const CreateRowSchema = z.object({
  model_id: z.string().uuid("Invalid model ID"),
  target_image_url: z.string().optional(),
  ref_image_urls: z.array(z.string()).optional(),
  prompt_override: z.string().optional()
});

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedData = CreateRowSchema.parse(body);

    // Verify model exists and user has access (RLS will handle this)
    const { data: model, error: modelError } = await supabase
      .from("models")
      .select("id")
      .eq("id", validatedData.model_id)
      .single();

    if (modelError || !model) {
      return NextResponse.json({ error: "Model not found or access denied" }, { status: 404 });
    }

    // Create the row
    const { data: row, error } = await supabase
      .from("model_rows")
      .insert({
        model_id: validatedData.model_id,
        // Fallback to empty string to support databases that still have NOT NULL constraint
        target_image_url: validatedData.target_image_url ?? '',
        ref_image_urls: validatedData.ref_image_urls || null,
        prompt_override: validatedData.prompt_override || null,
        status: "idle",
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create row:", error);
      return NextResponse.json({ error: "Failed to create row" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Rows POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


