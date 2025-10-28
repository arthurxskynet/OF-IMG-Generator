import { createServer } from "@/lib/supabase-server";
import { ensureUserOnboarding } from "@/lib/onboarding";
import { signPath } from "@/lib/storage";
import { ModelsContent } from "@/components/models-content";

const Page = async () => {
  const supabase = await createServer();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user?.id) {
    try {
      await ensureUserOnboarding(session.user.id);
    } catch {
      // Swallow onboarding errors
    }
  }

  // Fetch all models accessible to the user
  const { data: models, error: modelsError } = await supabase
    .from("models")
    .select(`
      id, 
      name, 
      default_prompt, 
      default_ref_headshot_url, 
      requests_default, 
      size,
      output_width,
      output_height,
      created_at,
      model_rows (
        id,
        status,
        jobs (
          id,
          status
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (modelsError) {
    console.error("Failed to fetch models:", modelsError);
  }

  // Sign URLs for headshot previews and calculate stats
  const modelsWithData = await Promise.all(
    (models || []).map(async (model) => {
      let signedHeadshotUrl = null;
      if (model.default_ref_headshot_url) {
        try {
          signedHeadshotUrl = await signPath(model.default_ref_headshot_url, 3600);
        } catch (error) {
          console.error("Failed to sign headshot URL:", error);
        }
      }

      // Calculate row stats
      const totalRows = model.model_rows?.length || 0;
      const completedRows = model.model_rows?.filter(row => row.status === 'done').length || 0;
      const activeRows = model.model_rows?.filter(row => ['queued', 'running', 'partial'].includes(row.status)).length || 0;
      
      // Calculate total requests (jobs) across all rows
      const totalRequests = model.model_rows?.reduce((total, row) => {
        return total + (row.jobs?.length || 0);
      }, 0) || 0;

      return { 
        ...model, 
        signedHeadshotUrl,
        totalRows,
        completedRows,
        activeRows,
        totalRequests
      };
    })
  );

  return <ModelsContent initialModels={modelsWithData} />;
};

export default Page;


