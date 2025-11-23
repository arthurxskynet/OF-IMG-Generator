"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface NotificationSettings {
  email_notifications: boolean;
  job_completion_notifications: boolean;
  product_updates: boolean;
  reminders_enabled: boolean;
}

interface NotificationsSectionProps {
  initialData: NotificationSettings;
}

export function NotificationsSection({ initialData }: NotificationsSectionProps) {
  const [settings, setSettings] = useState<NotificationSettings>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    setIsLoading(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update settings");
      }

      toast({
        title: "Settings updated",
        description: "Your notification preferences have been saved.",
      });
    } catch (error) {
      // Revert on error
      setSettings(settings);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure reminders, job completions, and product updates.
        </p>
      </div>

      <div className="space-y-6">
        {/* Email Notifications */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email_notifications" className="text-base">
              Email Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive email notifications for important updates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Switch
              id="email_notifications"
              checked={settings.email_notifications}
              onCheckedChange={(checked) => updateSetting("email_notifications", checked)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Job Completion Notifications */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="job_completion_notifications" className="text-base">
              Job Completion Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when your image generation jobs complete.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Switch
              id="job_completion_notifications"
              checked={settings.job_completion_notifications}
              onCheckedChange={(checked) => updateSetting("job_completion_notifications", checked)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Product Updates */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="product_updates" className="text-base">
              Product Updates
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive updates about new features and improvements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Switch
              id="product_updates"
              checked={settings.product_updates}
              onCheckedChange={(checked) => updateSetting("product_updates", checked)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Reminders */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="reminders_enabled" className="text-base">
              Reminders
            </Label>
            <p className="text-sm text-muted-foreground">
              Enable reminders for pending tasks and deadlines.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Switch
              id="reminders_enabled"
              checked={settings.reminders_enabled}
              onCheckedChange={(checked) => updateSetting("reminders_enabled", checked)}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

