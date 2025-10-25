import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds for Pro plan, 10 for Hobby

// Environment-based configuration
const BATCH_SIZE = Number(process.env.BULK_UPLOAD_BATCH_SIZE || 2);
const BATCH_DELAY_MS = Number(process.env.BULK_UPLOAD_BATCH_DELAY_MS || 1000);
const MAX_FILES_PER_UPLOAD = Number(process.env.BULK_UPLOAD_MAX_FILES || 10);

// Type definitions
type UploadSuccess = {
  success: true;
  row: {
    id: string;
    model_id: string;
    target_image_url: string;
    ref_image_urls: string[] | null;
    prompt_override: string | null;
    status: string;
    created_by: string;
    created_at: string;
    updated_at: string;
  };
  filename: string;
};

type UploadError = {
  success: false;
  filename: string;
  error: string;
};

type UploadResult = UploadSuccess | UploadError;

const BulkUploadSchema = z.object({
  model_id: z.string().uuid("Invalid model ID"),
  files: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    data: z.string() // base64 encoded file data
  })).min(1).max(MAX_FILES_PER_UPLOAD) // Configurable limit
});

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedData = BulkUploadSchema.parse(body);

    console.log(`[Bulk Upload] Starting for model: ${validatedData.model_id}, user: ${user.id}, files: ${validatedData.files.length}`);

    // Verify model exists and user has access
    const { data: model, error: modelError } = await supabase
      .from("models")
      .select("id, owner_id, team_id")
      .eq("id", validatedData.model_id)
      .single();

    if (modelError || !model) {
      console.error("Model not found:", { modelId: validatedData.model_id, error: modelError });
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Check if user owns the model
    if (model.owner_id !== user.id) {
      console.error("User does not own model:", { 
        userId: user.id, 
        modelOwnerId: model.owner_id 
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const results: UploadSuccess[] = [];
    const errors: UploadError[] = [];

    // Process files in configurable batches to avoid overwhelming the server
    for (let i = 0; i < validatedData.files.length; i += BATCH_SIZE) {
      const batch = validatedData.files.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (fileData, index): Promise<UploadResult> => {
        try {
          // Add small delay between files in batch
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          // Create row first
          const { data: row, error: rowError } = await supabase
            .from("model_rows")
            .insert({
              model_id: validatedData.model_id,
              target_image_url: '',
              ref_image_urls: null,
              prompt_override: null,
              status: "idle",
              created_by: user.id
            })
            .select()
            .single();

          if (rowError || !row) {
            throw new Error(`Failed to create row: ${rowError?.message || 'Unknown error'}`);
          }

          // Convert base64 to buffer and upload to storage
          const fileBuffer = Buffer.from(fileData.data, 'base64');
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).slice(2, 8);
          const sanitizedName = fileData.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const objectKey = `${user.id}/${timestamp}-${randomSuffix}-${sanitizedName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('targets')
            .upload(objectKey, fileBuffer, {
              contentType: fileData.type,
              upsert: false
            });

          if (uploadError) {
            // Clean up the created row if upload fails
            await supabase.from('model_rows').delete().eq('id', row.id);
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // Update row with uploaded image URL
          const { data: updatedRow, error: updateError } = await supabase
            .from("model_rows")
            .update({
              target_image_url: `targets/${uploadData.path}`
            })
            .eq('id', row.id)
            .select()
            .single();

          if (updateError || !updatedRow) {
            // Clean up uploaded file and row if update fails
            await supabase.storage.from('targets').remove([uploadData.path]);
            await supabase.from('model_rows').delete().eq('id', row.id);
            throw new Error(`Failed to update row: ${updateError?.message || 'Unknown error'}`);
          }

          return {
            success: true,
            row: updatedRow,
            filename: fileData.name
          } as UploadSuccess;

        } catch (error) {
          console.error(`Error processing file ${fileData.name}:`, error);
          return {
            success: false,
            filename: fileData.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          } as UploadError;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Separate successes and errors
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result as UploadSuccess);
        } else {
          errors.push(result as UploadError);
        }
      });

      // Add configurable delay between batches
      if (i + BATCH_SIZE < validatedData.files.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[Bulk Upload] Completed: ${results.length} success, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      results,
      errors,
      summary: {
        total: validatedData.files.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    console.error("[Bulk Upload] Error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
