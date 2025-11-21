"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ModelCard } from "@/components/model-card";
import { Sparkles, FolderOpen } from "lucide-react";

interface ModelsContentProps {
  initialModels: Array<{
    id: string;
    name: string | null;
    default_prompt: string | null;
    signedHeadshotUrl?: string | null;
    created_at: string;
    totalRows?: number;
    completedRows?: number;
    activeRows?: number;
    totalRequests?: number;
    size?: string | null;
  }>;
}

export function ModelsContent({ initialModels }: ModelsContentProps) {
  const [models, setModels] = useState(initialModels);

  const handleDeleteModel = (modelId: string) => {
    setModels(prev => prev.filter(model => model.id !== modelId));
  };

  return (
    <div className="p-6 space-y-8 bg-gradient-to-br from-background via-background to-muted/20 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-primary" />
            Models
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your AI generation models
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="shadow-sm hover:shadow transition-shadow">
            <Link href="/models?pageSize=18">Density</Link>
          </Button>
          <Button asChild className="shadow-md hover:shadow-lg transition-shadow">
            <Link href="/models/new" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              New Model
            </Link>
          </Button>
        </div>
      </div>

      {models.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              showStats={true}
              onDelete={handleDeleteModel}
            />
          ))}
        </div>
      ) : (
        <Card className="border-2 border-dashed border-border/50 bg-gradient-to-br from-card to-card/50">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 rounded-full bg-primary/10 p-4 w-fit">
              <FolderOpen className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">No Models Yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Create your first model to start generating images with AI. Get started by creating a new model and uploading your reference images.
            </p>
            <Button asChild size="lg" className="shadow-md hover:shadow-lg">
              <Link href="/models/new" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Create Your First Model
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
