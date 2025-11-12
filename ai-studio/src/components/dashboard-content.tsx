"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { ModelCard } from "@/components/model-card";
import { useToast } from "@/hooks/use-toast";

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
  const [tutorialEnabled, setTutorialEnabled] = useState(false);
  const [isLoadingTutorial, setIsLoadingTutorial] = useState(true);
  const [tourParam, setTourParam] = useQueryState('tour', {
    parse: (value) => value === '1',
    serialize: (value) => value ? '1' : null,
    defaultValue: false,
  });
  const { toast } = useToast();

  // Fetch tutorial enabled state
  useEffect(() => {
    async function fetchTutorialEnabled() {
      try {
        const response = await fetch('/api/user/settings');
        if (response.ok) {
          const data = await response.json();
          setTutorialEnabled(data.tutorial_enabled ?? false);
        }
      } catch (error) {
        console.error('Failed to fetch tutorial settings:', error);
      } finally {
        setIsLoadingTutorial(false);
      }
    }
    
    fetchTutorialEnabled();
  }, []);

  const handleTutorialToggle = async (enabled: boolean) => {
    setTutorialEnabled(enabled);
    setTourParam(enabled);
    // Inform the TutorialProvider immediately
    try {
      window.dispatchEvent(new CustomEvent('ai-studio:tutorial-toggle', { detail: { enabled } }));
    } catch {}
    
    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorial_enabled: enabled }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update tutorial settings');
      }
      
      if (enabled) {
        toast({
          title: 'Tutorial enabled',
          description: 'The tutorial will guide you through the app.',
        });
      }
    } catch (error) {
      console.error('Failed to update tutorial settings:', error);
      toast({
        title: 'Update failed',
        description: 'Failed to update tutorial settings',
        variant: 'destructive',
      });
      // Revert state on error
      setTutorialEnabled(!enabled);
      setTourParam(!enabled);
    }
  };

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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="tutorial-toggle"
              checked={tutorialEnabled}
              onCheckedChange={handleTutorialToggle}
              disabled={isLoadingTutorial}
            />
            <Label htmlFor="tutorial-toggle" className="text-sm cursor-pointer">
              Tutorial
            </Label>
          </div>
          <div className="flex gap-3">
            <Button asChild data-tour="dashboard-create-model">
              <Link href="/models/new">New Model</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/models">View Models</Link>
            </Button>
          </div>
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
              <Button asChild data-tour="dashboard-create-model">
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
