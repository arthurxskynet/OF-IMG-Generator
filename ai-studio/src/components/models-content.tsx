"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ModelCard } from "@/components/model-card";

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
}
