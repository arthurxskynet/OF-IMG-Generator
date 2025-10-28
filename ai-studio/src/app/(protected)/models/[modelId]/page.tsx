import { createServer } from "@/lib/supabase-server";
import { ModelWorkspaceWrapper } from "@/components/model-workspace-wrapper";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SortFilter } from "@/components/sort-filter";
import { fetchModelRowsPage } from "@/lib/model-data";
import { DEFAULT_IMAGE_LIMIT, DEFAULT_ROW_LIMIT } from "@/types/model-api";

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

  const initialPage = await fetchModelRowsPage(supabase, modelId, {
    sort,
    rowLimit: DEFAULT_ROW_LIMIT,
    rowOffset: 0,
    imageLimit: DEFAULT_IMAGE_LIMIT
  });

  if (!initialPage) {
    console.error("Model fetch error:", { modelId, userId: user.id });
    return notFound();
  }

  const { model, counts } = initialPage;

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
                    <span className="font-semibold text-foreground" suppressHydrationWarning>{counts.totalRows}</span> generation rows
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-foreground" suppressHydrationWarning>{counts.totalImages}</span> generated images
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    <span className="font-semibold text-foreground" suppressHydrationWarning>
                      {model.output_width || 4096} × {model.output_height || 4096}px
                    </span> output size
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
          <ModelWorkspaceWrapper initialPage={initialPage} sort={sort} />
        </Suspense>
      </div>
    </div>
  );
};

export default Page;


