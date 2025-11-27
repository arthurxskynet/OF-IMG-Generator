"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ModelCard } from "@/components/model-card";
import { StatisticsCards } from "@/components/statistics-cards";
import { RecentActivity } from "@/components/recent-activity";
import { ActiveJobsWidget } from "@/components/active-jobs-widget";
import { Sparkles, FolderOpen, Settings, Layers } from "lucide-react";

interface DashboardContentProps {
  initialModels: Array<{
    id: string;
    name: string | null;
    default_prompt: string | null;
    signedHeadshotUrl?: string | null;
    created_at: string;
    rowCount?: number;
  }>;
  recentImages?: Array<{
    id: string;
    thumbnail_url?: string | null;
    output_url: string;
    model_id: string | null;
    row_id: string | null;
    variant_row_id?: string | null;
    isFromVariant?: boolean;
    created_at: string;
    model?: {
      id: string;
      name: string | null;
    };
  }>;
  recentJobs?: Array<{
    id: string;
    status: string;
    model_id: string;
    row_id: string | null;
    variant_row_id?: string | null;
    created_at: string;
    model?: {
      id: string;
      name: string | null;
    };
  }>;
}

export function DashboardContent({ 
  initialModels, 
  recentImages = [], 
  recentJobs = [] 
}: DashboardContentProps) {
  const [models, setModels] = useState(initialModels);
  const [stats, setStats] = useState<{
    totalModels: number;
    totalImages: number;
    totalRows: number;
    activeJobs: number;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Sync models when initialModels changes (for server component updates)
  useEffect(() => {
    if (initialModels && initialModels.length > 0) {
      setModels(initialModels);
      console.log(`[DashboardContent] Updated models: ${initialModels.length} models`);
    }
  }, [initialModels]);

  // Log initial state
  useEffect(() => {
    console.log(`[DashboardContent] Initial models count: ${initialModels?.length || 0}`, {
      models: initialModels,
      modelsLength: models.length,
    });
  }, []);

  // Fetch user statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/user/stats", {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch statistics:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  const handleDeleteModel = (modelId: string) => {
    setModels(prev => prev.filter(model => model.id !== modelId));
  };

  return (
    <div className="p-6 space-y-8 bg-gradient-to-br from-background via-background to-muted/20 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Welcome to AI Studio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild data-tour="dashboard-create-model" className="shadow-md hover:shadow-lg transition-shadow">
            <Link href="/models/new" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              New Model
            </Link>
          </Button>
          <Button variant="outline" asChild className="shadow-sm hover:shadow transition-shadow">
            <Link href="/models" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              View Models
            </Link>
          </Button>
          <Button variant="outline" asChild className="shadow-sm hover:shadow transition-shadow">
            <Link href="/variants" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Variants
            </Link>
          </Button>
          <Button variant="outline" asChild className="shadow-sm hover:shadow transition-shadow">
            <Link href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <StatisticsCards stats={stats} />
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Models and Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Jobs Widget */}
          {stats && stats.activeJobs > 0 && (
            <ActiveJobsWidget initialCount={stats.activeJobs} />
          )}

          {/* Recent Models */}
          {models.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  Recent Models
                </h2>
                {models.length >= 6 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/models">View All →</Link>
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {models.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    onDelete={handleDeleteModel}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-2 border-dashed border-border/50 bg-gradient-to-br from-card to-card/50">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 rounded-full bg-primary/10 p-4 w-fit">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Get Started</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Create your first model to start generating images with AI. Get started by creating a new model and uploading your reference images.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button asChild data-tour="dashboard-create-model" size="lg" className="shadow-md hover:shadow-lg">
                    <Link href="/models/new" className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Create Model
                    </Link>
                  </Button>
                  <Button variant="outline" asChild size="lg" className="shadow-sm hover:shadow">
                    <Link href="/models">Browse Models</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Recent Activity */}
        <div className="lg:sticky lg:top-6 space-y-6 h-fit">
          <RecentActivity images={recentImages} jobs={recentJobs} />
        </div>
      </div>
    </div>
  );
}
