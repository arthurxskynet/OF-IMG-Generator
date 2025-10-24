import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const UpdateRowSchema = z.object({
  target_image_url: z.string().nullable().optional(),
  ref_image_urls: z.array(z.string()).nullable().optional(),
  prompt_override: z.string().nullable().optional(),
  status: z.enum(["idle", "queued", "running", "partial", "done", "error"]).optional()
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch row with generated images
    const { data: row, error } = await supabase
      .from("model_rows")
      .select(`
        *,
        generated_images (
          id,
          output_url,
          is_upscaled,
          is_favorited,
          created_at
        )
      `)
      .eq("id", rowId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ row }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Row GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedData = UpdateRowSchema.parse(body);

    // First, verify the row exists and belongs to the user
    const { data: existingRow, error: fetchError } = await supabase
      .from("model_rows")
      .select("id, model_id, models!inner(owner_id)")
      .eq("id", rowId)
      .single();

    if (fetchError || !existingRow) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    // Check if user owns the model
    if (existingRow.models.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Align with databases that still enforce NOT NULL on target_image_url
    const updateData = {
      ...validatedData,
      ...(validatedData.target_image_url === null ? { target_image_url: '' } : {})
    };

    const { data: row, error } = await supabase
      .from("model_rows")
      .update(updateData)
      .eq("id", rowId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update row:", error);
      return NextResponse.json({ 
        error: "Failed to update row", 
        details: error.message 
      }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("Row PATCH error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1) Load the row (and model) to know what storage objects might be referenced
    const { data: row, error: rowErr } = await supabase
      .from("model_rows")
      .select("id, model_id, ref_image_urls, target_image_url")
      .eq("id", rowId)
      .single();

    if (rowErr || !row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    const { data: model, error: modelErr } = await supabase
      .from("models")
      .select("id, default_ref_headshot_url")
      .eq("id", row.model_id)
      .single();

    if (modelErr || !model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // 2) Gather output images tied to this row before deleting the row (DB cascade will remove these records)
    const { data: outputs } = await supabase
      .from("generated_images")
      .select("output_url")
      .eq("row_id", rowId);

    const outputPaths = (outputs || [])
      .map(o => o.output_url)
      .filter((p): p is string => typeof p === "string" && p.length > 0);

    // 3) Build list of candidate storage paths to delete (only if unreferenced elsewhere)
    const candidatePaths = new Set<string>();
    if (row.target_image_url && row.target_image_url.trim() !== "") {
      candidatePaths.add(row.target_image_url);
    }
    if (row.ref_image_urls && Array.isArray(row.ref_image_urls)) {
      for (const refUrl of row.ref_image_urls) {
        if (refUrl && refUrl.trim() !== "" && refUrl !== model.default_ref_headshot_url) {
          candidatePaths.add(refUrl);
        }
      }
    }
    for (const p of outputPaths) candidatePaths.add(p);

    const parseObjectPath = (objectPath: string) => {
      const [bucket, ...rest] = objectPath.split("/");
      const key = rest.join("/");
      return { bucket, key } as const;
    };

    // 4) For each candidate path, check if it is still referenced by other rows/models/images
    const deleteIfUnreferenced = async (objectPath: string) => {
      const { bucket, key } = parseObjectPath(objectPath);
      if (!bucket || !key) return; // skip invalid path

      const admin = supabaseAdmin;

      // Check model_rows.target_image_url references (excluding current row)
      const { count: targetRefCount } = await admin
        .from("model_rows")
        .select("id", { count: "exact", head: true })
        .eq("target_image_url", objectPath)
        .neq("id", rowId);

      // Check model_rows.ref_image_urls references (excluding current row)
      const { count: refRefCount } = await admin
        .from("model_rows")
        .select("id", { count: "exact", head: true })
        .contains("ref_image_urls", [objectPath])
        .neq("id", rowId);

      // Check models.default_ref_headshot_url references
      const { count: modelHeadshotCount } = await admin
        .from("models")
        .select("id", { count: "exact", head: true })
        .eq("default_ref_headshot_url", objectPath);

      // Check generated_images.output_url references (excluding current row)
      const { count: outputRefCount } = await admin
        .from("generated_images")
        .select("id", { count: "exact", head: true })
        .eq("output_url", objectPath)
        .neq("row_id", rowId);

      const totalRefs = (targetRefCount || 0) + (refRefCount || 0) + (modelHeadshotCount || 0) + (outputRefCount || 0);

      if (totalRefs === 0) {
        // Safe to delete the storage object
        const { error: delErr } = await admin.storage.from(bucket).remove([key]);
        if (delErr) {
          console.warn("Failed to delete storage object", { bucket, key, error: delErr.message });
        }
      }
    };

    // 5) Attempt storage cleanup in parallel (best-effort)
    await Promise.all(Array.from(candidatePaths).map(deleteIfUnreferenced));

    // 6) Finally delete the row (cascade will remove jobs and generated_images records)
    const { error } = await supabase
      .from("model_rows")
      .delete()
      .eq("id", rowId);

    if (error) {
      console.error("Failed to delete row:", error);
      return NextResponse.json({ error: "Failed to delete row" }, { status: 500 });
    }

    // Explicitly prevent caching of the response
    return NextResponse.json({ ok: true, deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Row DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


