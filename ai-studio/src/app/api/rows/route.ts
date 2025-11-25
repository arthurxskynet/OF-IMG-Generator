import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

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

    console.log("Creating row for model:", validatedData.model_id, "user:", user.id);

    // Verify model exists and user has access
    const { data: model, error: modelError } = await supabase
      .from("models")
      .select("id, owner_id, team_id")
      .eq("id", validatedData.model_id)
      .single();

    console.log("Model lookup result:", { model, modelError });

    if (modelError || !model) {
      console.error("Model not found:", { modelId: validatedData.model_id, error: modelError });
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Check if user has access to the model (admin, owner, team member, or team owner)
    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
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
      console.error("User does not have access to model:", { 
        userId: user.id, 
        modelOwnerId: model.owner_id,
        modelTeamId: model.team_id,
        isAdmin
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create the row with retry logic for potential race conditions
    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
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
          throw error;
        }

        return NextResponse.json({ ok: true, row });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        retries--;
        
        if (retries > 0) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    console.error("Failed to create row after retries:", lastError);
    return NextResponse.json({ 
      error: "Failed to create row", 
      details: lastError?.message || "Unknown error"
    }, { status: 500 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Rows POST error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}


