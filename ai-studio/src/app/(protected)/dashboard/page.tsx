import { createServer } from "@/lib/supabase-server";
import { ensureUserOnboarding } from "@/lib/onboarding";
import { signPath } from "@/lib/storage";
import { DashboardContent } from "@/components/dashboard-content";

const Page = async () => {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user?.id) {
    return null;
  }

  if (user.id) {
    try {
      await ensureUserOnboarding(user.id);
    } catch {
      // Swallow onboarding errors to avoid breaking the dashboard on signin
    }
  }

  // Fetch all data in parallel
  const [
    modelsResult,
    recentImagesResult,
    recentJobsResult,
    recentVariantImagesResult,
  ] = await Promise.all([
    // Fetch models for preview (RLS will handle access control)
    supabase
      .from("models")
      .select(`
        id, 
        name, 
        default_prompt, 
        default_ref_headshot_url, 
        requests_default, 
        created_at,
        model_rows (
          id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(6),

    // Fetch recent images from model_rows (last 10)
    supabase
      .from("generated_images")
      .select(`
        id,
        thumbnail_url,
        output_url,
        model_id,
        row_id,
        created_at,
        model:models (
          id,
          name
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),

    // Fetch recent jobs (last 10) - includes both model_rows and variant_rows
    supabase
      .from("jobs")
      .select(`
        id,
        model_id,
        row_id,
        variant_row_id,
        status,
        created_at,
        model:models (
          id,
          name
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),

    // Fetch recent variant-generated images (last 10)
    supabase
      .from("variant_row_images")
      .select(`
        id,
        thumbnail_path,
        output_path,
        variant_row_id,
        created_at,
        variant_rows (
          model_id,
          models (
            id,
            name
          )
        )
      `)
      .eq("is_generated", true)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Log errors if any
  if (modelsResult.error) {
    console.error("[Dashboard] Error fetching models:", modelsResult.error);
  }
  if (recentImagesResult.error) {
    console.error("[Dashboard] Error fetching recent images:", recentImagesResult.error);
  }
  if (recentJobsResult.error) {
    console.error("[Dashboard] Error fetching recent jobs:", recentJobsResult.error);
  }
  if (recentVariantImagesResult.error) {
    // Only log if it's not a table-not-found error (variants might not be set up)
    if (recentVariantImagesResult.error.code !== '42P01') {
      console.error("[Dashboard] Error fetching variant images:", recentVariantImagesResult.error);
    }
  }

  // Sign URLs for headshot previews and calculate row count
  const models = modelsResult.data || [];
  console.log(`[Dashboard] Fetched ${models.length} models for user ${user.id}`);
  
  const modelsWithSignedUrls = await Promise.all(
    models.map(async (model) => {
      let signedHeadshotUrl = null;
      if (model.default_ref_headshot_url) {
        try {
          signedHeadshotUrl = await signPath(model.default_ref_headshot_url, 3600);
          // signPath now returns null for missing files instead of throwing
          if (!signedHeadshotUrl) {
            console.warn(`[Dashboard] Headshot URL not found for model ${model.id}:`, model.default_ref_headshot_url);
          }
        } catch (error) {
          // Only log as error if it's an unexpected error (not a missing file)
          console.warn(`[Dashboard] Failed to sign headshot URL for model ${model.id}:`, error instanceof Error ? error.message : error);
        }
      }
      
      // Calculate row count
      const rowCount = model.model_rows?.length || 0;
      
      // Return only the fields needed by the component
      return {
        id: model.id,
        name: model.name,
        default_prompt: model.default_prompt,
        signedHeadshotUrl,
        created_at: model.created_at,
        rowCount,
      };
    })
  );

  console.log(`[Dashboard] Processed ${modelsWithSignedUrls.length} models with signed URLs`);

  // Process recent images from model_rows - sign thumbnail URLs
  const recentModelImages = await Promise.all(
    (recentImagesResult.data || []).map(async (image) => {
      let signedThumbnailUrl = null;
      const pathToSign = image.thumbnail_url || image.output_url;
      
      if (pathToSign) {
        try {
          signedThumbnailUrl = await signPath(pathToSign, 3600);
          // signPath now returns null for missing files instead of throwing
          if (!signedThumbnailUrl) {
            console.warn(`[Dashboard] Image URL not found for image ${image.id}:`, pathToSign);
          }
        } catch (error) {
          // Only log as warning for missing files (expected for old data)
          console.warn(`[Dashboard] Failed to sign image URL for image ${image.id}:`, error instanceof Error ? error.message : error);
        }
      }

      const model = Array.isArray(image.model) ? image.model[0] : image.model;

      return {
        id: image.id,
        thumbnail_url: signedThumbnailUrl,
        output_url: image.output_url,
        model_id: image.model_id,
        row_id: image.row_id,
        variant_row_id: null,
        isFromVariant: false,
        created_at: image.created_at,
        model: model ? {
          id: model.id,
          name: model.name,
        } : undefined,
      };
    })
  );

  // Process recent variant-generated images - sign thumbnail URLs
  const recentVariantImages = await Promise.all(
    (recentVariantImagesResult.data || []).map(async (image) => {
      let signedThumbnailUrl = null;
      const pathToSign = image.thumbnail_path || image.output_path;
      
      if (pathToSign) {
        try {
          signedThumbnailUrl = await signPath(pathToSign, 3600);
          if (!signedThumbnailUrl) {
            console.warn(`[Dashboard] Variant image URL not found for image ${image.id}:`, pathToSign);
          }
        } catch (error) {
          console.warn(`[Dashboard] Failed to sign variant image URL for image ${image.id}:`, error instanceof Error ? error.message : error);
        }
      }

      // Extract model info from variant_rows relation
      // When querying from variant_row_images, variant_rows is returned as a single object (one-to-many from child side)
      // But Supabase may return it as an array in some cases, so we handle both
      const variantRow = Array.isArray(image.variant_rows) ? image.variant_rows[0] : image.variant_rows;
      // models is a nested relation within variant_rows, should be a single object
      const modelsData = variantRow?.models;
      const model = modelsData ? (Array.isArray(modelsData) ? modelsData[0] : modelsData) : null;

      return {
        id: image.id,
        thumbnail_url: signedThumbnailUrl,
        output_url: image.output_path,
        model_id: variantRow?.model_id || null,
        row_id: null,
        variant_row_id: image.variant_row_id,
        isFromVariant: true,
        created_at: image.created_at,
        model: model ? {
          id: model.id,
          name: model.name,
        } : undefined,
      };
    })
  );

  // Combine and sort all images by created_at
  const recentImages = [...recentModelImages, ...recentVariantImages]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  // Process recent jobs - handle both model_rows and variant_rows
  const recentJobs = (recentJobsResult.data || []).map((job) => {
    const model = Array.isArray(job.model) ? job.model[0] : job.model;
    
    return {
      id: job.id,
      status: job.status,
      model_id: job.model_id,
      row_id: job.row_id,
      variant_row_id: job.variant_row_id || null,
      created_at: job.created_at,
      model: model ? {
        id: model.id,
        name: model.name,
      } : undefined,
    };
  });

  return (
    <DashboardContent
      initialModels={modelsWithSignedUrls}
      recentImages={recentImages}
      recentJobs={recentJobs}
    />
  );
};

export default Page;


