import { createServer } from "@/lib/supabase-server";
import { ModelWorkspaceWrapper } from "@/components/model-workspace-wrapper";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SortFilter } from "@/components/sort-filter";

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ modelId: string }>;
  searchParams: Promise<{ sort?: string }>;
}

const Page = async ({ params, searchParams }: PageProps) => {
  const { modelId } = await params;
  const { sort } = await searchParams;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return notFound();
  }

  // Fetch model with its rows and generated images
  const { data: model, error: modelError } = await supabase
    .from("models")
    .select(`
      *,
      model_rows (
        id,
        ref_image_urls,
        target_image_url,
        prompt_override,
        status,
        created_at,
        generated_images (
          id,
          output_url,
          is_favorited,
          created_at
        )
      )
    `)
    .eq("id", modelId)
    .single();

  if (modelError || !model) {
    console.error("Model fetch error:", modelError);
    console.error("Model ID:", modelId);
    console.error("User ID:", user.id);
    return notFound();
  }

  // Sort the model rows based on the sort parameter
  if (model.model_rows) {
    const sortOrder = sort === 'oldest' ? 1 : -1;
    model.model_rows.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return (dateA - dateB) * sortOrder;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Enhanced Header */}
      <div className="relative pt-6 pb-4">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 rounded-2xl blur-3xl" />
        <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent" suppressHydrationWarning>
                {model.name ?? 'Untitled Model'}
              </h1>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-foreground" suppressHydrationWarning>{model.model_rows?.length ?? 0}</span> generation rows
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-foreground" suppressHydrationWarning>{model.size ?? 'Unknown'}</span> model size
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-foreground" suppressHydrationWarning>{model.requests_default ?? 0}</span> default requests
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SortFilter currentSort={sort === 'oldest' ? 'oldest' : 'newest'} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="pb-6">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
          </div>
        }>
          <ModelWorkspaceWrapper model={model} rows={model.model_rows || []} sort={sort} />
        </Suspense>
      </div>
    </div>
  );
};

export default Page;


