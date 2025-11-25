import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { deleteStorageFiles } from "@/lib/storage";
import { GeneratedImage } from "@/types/jobs";
import { isAdminUser } from "@/lib/admin";

// Extended type for model rows with generated images
interface ModelRowWithImages {
  id: string;
  model_id: string;
  ref_image_urls?: string[];
  target_image_url?: string;
  prompt_override?: string;
  status: string;
  created_at: string;
  updated_at: string;
  generated_images?: GeneratedImage[];
}

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UpdateModelSchema = z.object({
  name: z.string().min(2).optional(),
  default_prompt: z.string().min(3).optional(),
  default_ref_headshot_url: z.string().optional(),
  requests_default: z.number().int().min(1).max(50).optional(),
  size: z.string().optional(),
  output_width: z.number().int().min(1024).max(4096).optional(),
  output_height: z.number().int().min(1024).max(4096).optional()
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort');
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch model with its rows and latest images
    const { data: model, error: modelError } = await supabase
      .from("models")
      .select(`
        *,
        model_rows (
          id,
          ref_image_urls,
          target_image_url,
          prompt_override,
          match_target_ratio,
          status,
          created_at,
          generated_images (
            id,
            output_url,
            is_favorited,
            prompt_text,
            created_at
          )
        )
      `)
      .eq("id", id)
      .order('created_at', { referencedTable: 'model_rows', ascending: sort === 'oldest' })
      .single();

    // Deduplicate nested arrays defensively (by id/output_url) to avoid UI confusion
    if (model?.model_rows) {
      const seenRows = new Set<string>()
      model.model_rows = (model.model_rows as ModelRowWithImages[]).filter((r: ModelRowWithImages) => {
        if (!r?.id) return false
        if (seenRows.has(r.id)) return false
        seenRows.add(r.id)
        return true
      })
      for (const r of model.model_rows as ModelRowWithImages[]) {
        if (Array.isArray(r.generated_images)) {
          const seenImgs = new Set<string>()
          r.generated_images = r.generated_images.filter((img: GeneratedImage) => {
            const key = img?.id || img?.output_url
            if (!key) return false
            if (seenImgs.has(key)) return false
            seenImgs.add(key)
            return true
          })
        }
      }

      // Sort the model rows and their images based on the sort parameter
      // Note: Database-level ordering is now handled in the query above,
      // but keeping this as defensive measure for edge cases
      const sortOrder = sort === 'oldest' ? 1 : -1;
      model.model_rows.sort((a: ModelRowWithImages, b: ModelRowWithImages) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return (dateA - dateB) * sortOrder;
      });
      
      // Sort images within each row (oldest to newest, left to right)
      model.model_rows.forEach((row: ModelRowWithImages) => {
        if (row.generated_images && Array.isArray(row.generated_images)) {
          row.generated_images.sort((a: GeneratedImage, b: GeneratedImage) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB; // Always ascending (oldest first)
          });
        }
      });
    }

    if (modelError || !model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json({ model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Model GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedData = UpdateModelSchema.parse(body);

    // Check access before updating
    const { data: existingModel, error: fetchError } = await supabase
      .from("models")
      .select("id, owner_id, team_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingModel) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const isAdmin = await isAdminUser()
    let hasAccess = isAdmin

    if (!hasAccess) {
      if (existingModel.team_id === null) {
        hasAccess = existingModel.owner_id === user.id
      } else {
        hasAccess = existingModel.owner_id === user.id

        if (!hasAccess) {
          const { data: teamMember } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', existingModel.team_id)
            .eq('user_id', user.id)
            .single()
          
          if (teamMember) {
            hasAccess = true
          } else {
            const { data: team } = await supabase
              .from('teams')
              .select('owner_id')
              .eq('id', existingModel.team_id)
              .single()
            
            hasAccess = team?.owner_id === user.id
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: model, error } = await supabase
      .from("models")
      .update(validatedData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update model:", error);
      return NextResponse.json({ error: "Failed to update model" }, { status: 500 });
    }

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, model });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Model PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // First, fetch all associated data to collect storage paths
    const { data: model, error: fetchError } = await supabase
      .from("models")
      .select(`
        id,
        name,
        owner_id,
        team_id,
        default_ref_headshot_url,
        model_rows (
          id,
          ref_image_urls,
          target_image_url,
          generated_images (
            id,
            output_url
          )
        )
      `)
      .eq("id", id)
      .single();

    if (fetchError || !model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Check access before deleting
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Collect all storage paths to delete
    const storagePaths: string[] = [];
    
    // Add model default headshot
    if (model.default_ref_headshot_url) {
      storagePaths.push(model.default_ref_headshot_url);
    }

    // Add row reference images, target images, and generated images
    if (model.model_rows) {
      for (const row of model.model_rows) {
        // Add reference images
        if (row.ref_image_urls && Array.isArray(row.ref_image_urls)) {
          storagePaths.push(...row.ref_image_urls.filter(Boolean));
        }
        
        // Add target image
        if (row.target_image_url) {
          storagePaths.push(row.target_image_url);
        }
        
        // Add generated images
        if (row.generated_images && Array.isArray(row.generated_images)) {
          for (const img of row.generated_images) {
            if (img.output_url) {
              storagePaths.push(img.output_url);
            }
          }
        }
      }
    }

    // Delete storage files
    const { deleted: filesDeleted, failed: filesFailed } = await deleteStorageFiles(storagePaths);
    
    if (filesFailed > 0) {
      console.warn(`Failed to delete ${filesFailed} storage files for model ${id}`);
    }

    // Delete the model (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from("models")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Failed to delete model:", deleteError);
      return NextResponse.json({ error: "Failed to delete model" }, { status: 500 });
    }

    // Calculate summary
    const rowsCount = model.model_rows?.length || 0;
    const imagesCount = model.model_rows?.reduce((total, row) => {
      return total + (row.generated_images?.length || 0);
    }, 0) || 0;

    return NextResponse.json({ 
      ok: true, 
      deleted: true,
      summary: {
        rowsDeleted: rowsCount,
        imagesDeleted: imagesCount,
        filesDeleted: filesDeleted
      }
    });
  } catch (error) {
    console.error("Model DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


