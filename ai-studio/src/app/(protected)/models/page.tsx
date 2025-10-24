import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="text-sm text-muted-foreground">
            Manage your AI generation models
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/models?pageSize=18">Density</Link>
          </Button>
          <Button asChild>
            <Link href="/models/new">New Model</Link>
          </Button>
        </div>
      </div>

      {modelsWithData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modelsWithData.map((model) => (
            <Link key={model.id} href={`/models/${model.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4 mb-4">
                    <Avatar className="h-16 w-16 flex-shrink-0">
                      {model.signedHeadshotUrl ? (
                        <AvatarImage src={model.signedHeadshotUrl} alt={model.name ?? 'Model'} />
                      ) : (
                        <AvatarFallback className="text-lg">
                          {(model.name ?? 'UM').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{model.name ?? 'Untitled Model'}</h3>
                      <p className="text-sm text-muted-foreground">
                        <span>{model.size ?? 'Unknown'}</span> • {model.totalRequests} requests
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {model.default_prompt}
                  </p>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex space-x-2">
                      <Badge variant="secondary">
                        {model.totalRows} rows
                      </Badge>
                      {model.completedRows > 0 && (
                        <Badge variant="default">
                          {model.completedRows} done
                        </Badge>
                      )}
                      {model.activeRows > 0 && (
                        <Badge variant="outline">
                          {model.activeRows} active
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Created <span>{new Date(model.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}</span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Models Yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create your first model to start generating images with AI.
            </p>
            <Button asChild>
              <Link href="/models/new">Create Your First Model</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Page;


