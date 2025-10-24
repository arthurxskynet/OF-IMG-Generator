"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ModelCard } from "@/components/model-card";

interface DashboardContentProps {
  initialModels: Array<{
    id: string;
    name: string | null;
    default_prompt: string | null;
    signedHeadshotUrl?: string | null;
    created_at: string;
    rowCount?: number;
  }>;
}

export function DashboardContent({ initialModels }: DashboardContentProps) {
  const [models, setModels] = useState(initialModels);

  const handleDeleteModel = (modelId: string) => {
    setModels(prev => prev.filter(model => model.id !== modelId));
  };

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

      {models.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4 tracking-tight">Recent Models</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onDelete={handleDeleteModel}
              />
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
}
