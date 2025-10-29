import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { deleteStorageFiles } from "@/lib/storage";
import { fetchModelRowsPage } from "@/lib/model-data";

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
  const parseIntParam = (value: string | null) => {
    if (value === null) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const page = await fetchModelRowsPage(supabase, id, {
      sort,
      rowLimit: parseIntParam(searchParams.get('rowLimit')),
      rowOffset: parseIntParam(searchParams.get('rowOffset')),
      imageLimit: parseIntParam(searchParams.get('imageLimit'))
    });

    if (!page) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
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


