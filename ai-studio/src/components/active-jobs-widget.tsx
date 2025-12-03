"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Zap, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveJobsWidgetProps {
  initialCount?: number;
  className?: string;
}

interface ActiveJob {
  id: string;
  model_id: string;
  row_id: string;
  status: string;
  model?: {
    id: string;
    name: string | null;
  };
}

export function ActiveJobsWidget({ initialCount = 0, className }: ActiveJobsWidgetProps) {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActiveJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/user/active-jobs", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch active jobs");
        }

        const data = await response.json();
        setActiveJobs(data.jobs || []);
      } catch (err) {
        console.error("Failed to fetch active jobs:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchActiveJobs();

    // Poll every 5 seconds for updates
    const interval = setInterval(fetchActiveJobs, 5000);

    return () => clearInterval(interval);
  }, []);

  const activeCount = activeJobs.length;
  const statusCounts = activeJobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (activeCount === 0 && !loading && initialCount === 0) {
    return null; // Don't show widget if there are no active jobs
  }

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Active Jobs
          </CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{activeCount}</span>
              <span className="text-sm text-muted-foreground">
                job{activeCount === 1 ? "" : "s"} in progress
              </span>
            </div>

            {activeCount > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <Badge
                      key={status}
                      variant={
                        status === "running" || status === "saving"
                          ? "default"
                          : "outline"
                      }
                      className={cn(
                        status === "running" && "bg-blue-500 hover:bg-blue-600",
                        status === "saving" && "bg-purple-500 hover:bg-purple-600"
                      )}
                    >
                      {status}: {count}
                    </Badge>
                  ))}
                </div>

                {activeJobs.length > 0 && (
                  <div className="pt-2 border-t">
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href="/models" className="flex items-center justify-center gap-2">
                        View Jobs
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            )}

            {activeCount === 0 && !loading && (
              <p className="text-sm text-muted-foreground">
                No active jobs. All caught up!
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


