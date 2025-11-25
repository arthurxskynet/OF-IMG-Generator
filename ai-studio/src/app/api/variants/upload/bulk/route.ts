import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds for Pro plan, 10 for Hobby

// Environment-based configuration
const BATCH_SIZE = Number(process.env.BULK_UPLOAD_BATCH_SIZE || 3);
const BATCH_DELAY_MS = Number(process.env.BULK_UPLOAD_BATCH_DELAY_MS || 1000);
const MAX_FILES_PER_UPLOAD = Number(process.env.BULK_UPLOAD_MAX_FILES || 100); // Increased from 10 to 100

// Type definitions
type UploadSuccess = {
  success: true;
  row: {
    id: string;
    user_id: string;
    team_id: string;
    model_id: string | null;
    name: string | null;
    prompt: string | null;
    output_width: number | null;
    output_height: number | null;
    match_target_ratio: boolean | null;
    created_at: string;
    updated_at: string;
    variant_row_images?: Array<{
      id: string;
      variant_row_id: string;
      output_path: string;
      thumbnail_path: string | null;
      source_row_id: string | null;
      position: number;
      is_generated: boolean;
      created_at: string;
    }>;
  };
  filename: string;
};

type UploadError = {
  success: false;
  filename: string;
  error: string;
};

type UploadResult = UploadSuccess | UploadError;

const VariantsBulkUploadSchema = z.object({
  model_id: z.string().uuid("Invalid model ID").optional().nullable(),
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
    const validatedData = VariantsBulkUploadSchema.parse(body);

    console.log(`[Variants Bulk Upload] Starting for model: ${validatedData.model_id || 'none'}, user: ${user.id}, files: ${validatedData.files.length}`);

    // Get user's team_id (use model's team_id if available)
    let teamId = user.id;

    // If model_id is provided, validate it exists and user has access
    if (validatedData.model_id) {
      const { data: model, error: modelError } = await supabase
        .from("models")
        .select("id, owner_id, team_id")
        .eq("id", validatedData.model_id)
        .single();

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

      // Use model's team_id if available, otherwise use user_id
      if (model.team_id) {
        teamId = model.team_id
      }
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

          // Create variant row first
          const { data: row, error: rowError } = await supabase
            .from("variant_rows")
            .insert({
              user_id: user.id,
              team_id: teamId,
              model_id: validatedData.model_id || null,
              name: null,
              prompt: null
            })
            .select()
            .single();

          if (rowError || !row) {
            throw new Error(`Failed to create variant row: ${rowError?.message || 'Unknown error'}`);
          }

          // Convert base64 to buffer and upload to storage (refs bucket for variant reference images)
          const fileBuffer = Buffer.from(fileData.data, 'base64');
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).slice(2, 8);
          const sanitizedName = fileData.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const objectKey = `${user.id}/${timestamp}-${randomSuffix}-${sanitizedName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('refs')
            .upload(objectKey, fileBuffer, {
              contentType: fileData.type,
              upsert: false
            });

          if (uploadError) {
            // Clean up the created row if upload fails
            await supabase.from('variant_rows').delete().eq('id', row.id);
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // Add image to variant_row_images as a reference image (is_generated = false)
          const { data: insertedImage, error: imageError } = await supabase
            .from('variant_row_images')
            .insert({
              variant_row_id: row.id,
              output_path: `refs/${uploadData.path}`,
              thumbnail_path: null,
              source_row_id: null,
              position: 0,
              is_generated: false // Explicitly mark as reference image
            })
            .select()
            .single();

          if (imageError || !insertedImage) {
            // Clean up uploaded file and row if image insert fails
            await supabase.storage.from('refs').remove([uploadData.path]);
            await supabase.from('variant_rows').delete().eq('id', row.id);
            throw new Error(`Failed to add image to row: ${imageError?.message || 'Unknown error'}`);
          }

          // Fetch the complete row with images for return
          const { data: completeRow, error: fetchError } = await supabase
            .from('variant_rows')
            .select(`
              *,
              variant_row_images (*)
            `)
            .eq('id', row.id)
            .single();

          if (fetchError || !completeRow) {
            // Still return success with the row we have, even if fetch failed
            return {
              success: true,
              row: {
                ...row,
                variant_row_images: [insertedImage]
              },
              filename: fileData.name
            } as UploadSuccess;
          }

          return {
            success: true,
            row: completeRow,
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

    console.log(`[Variants Bulk Upload] Completed: ${results.length} success, ${errors.length} errors`);

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
    
    console.error("[Variants Bulk Upload] Error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

