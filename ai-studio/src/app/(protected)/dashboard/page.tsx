import { createServer } from "@/lib/supabase-server";
import { ensureUserOnboarding } from "@/lib/onboarding";
import { signPath } from "@/lib/storage";
import { DashboardContent } from "@/components/dashboard-content";

const Page = async () => {
  const supabase = await createServer();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user?.id) {
    try {
      await ensureUserOnboarding(session.user.id);
    } catch {
      // Swallow onboarding errors to avoid breaking the dashboard on signin
    }
  }

  // Fetch models for preview
  const { data: models } = await supabase
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
    .limit(6);

  // Sign URLs for headshot previews and calculate row count
  const modelsWithSignedUrls = await Promise.all(
    (models || []).map(async (model) => {
      let signedHeadshotUrl = null;
      if (model.default_ref_headshot_url) {
        try {
          signedHeadshotUrl = await signPath(model.default_ref_headshot_url, 3600);
        } catch (error) {
          console.error("Failed to sign headshot URL:", error);
        }
      }
      
      // Calculate row count
      const rowCount = model.model_rows?.length || 0;
      
      return { ...model, signedHeadshotUrl, rowCount };
    })
  );

  return <DashboardContent initialModels={modelsWithSignedUrls} />;
};

export default Page;


