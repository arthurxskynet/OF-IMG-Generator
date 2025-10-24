import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createServer } from "@/lib/supabase-server";
import { ensureUserOnboarding } from "@/lib/onboarding";
import { signPath } from "@/lib/storage";

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome to AI Studio</p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/models/new">New Model</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/models">View Models</Link>
          </Button>
        </div>
      </div>

      {modelsWithSignedUrls.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4 tracking-tight">Recent Models</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modelsWithSignedUrls.map((model) => (
              <Link key={model.id} href={`/models/${model.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        {model.signedHeadshotUrl ? (
                          <AvatarImage src={model.signedHeadshotUrl} alt={model.name ?? 'Model'} />
                        ) : (
                          <AvatarFallback>{(model.name ?? 'UM').slice(0, 2).toUpperCase()}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{model.name ?? 'Untitled Model'}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {model.default_prompt}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {model.rowCount} rows
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(model.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <div className="mt-4" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create your first model to start generating images.
            </p>
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/models/new">Create Model</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/models">Browse Models</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Page;


