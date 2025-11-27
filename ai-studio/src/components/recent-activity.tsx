"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Image as ImageIcon, Clock, CheckCircle2, XCircle, Loader2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentImage {
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
}

interface RecentJob {
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
}

interface RecentActivityProps {
  images: RecentImage[];
  jobs: RecentJob[];
  className?: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "succeeded":
    case "completed":
      return (
        <Badge 
          variant="default" 
          className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 hover:bg-green-500/20 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3 mr-1.5" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge 
          variant="destructive"
          className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 transition-colors"
        >
          <XCircle className="h-3 w-3 mr-1.5" />
          Failed
        </Badge>
      );
    case "running":
    case "saving":
      return (
        <Badge 
          variant="secondary"
          className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
        >
          <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          Processing
        </Badge>
      );
    case "queued":
    case "submitted":
      return (
        <Badge 
          variant="outline"
          className="bg-muted/50 border-border/50 hover:bg-muted transition-colors"
        >
          <Clock className="h-3 w-3 mr-1.5" />
          Queued
        </Badge>
      );
    default:
      return (
        <Badge 
          variant="outline"
          className="bg-muted/50 border-border/50"
        >
          {status}
        </Badge>
      );
  }
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Client-only component to format time ago safely
function TimeAgo({ dateString }: { dateString: string }) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    setFormatted(formatTimeAgo(dateString));
  }, [dateString]);

  return <>{formatted || ""}</>;
}

export function RecentActivity({ images, jobs, className }: RecentActivityProps) {
  // Helper function to determine navigation URL
  const getActivityUrl = (activity: {
    model_id: string | null;
    row_id: string | null;
    variant_row_id?: string | null;
    isFromVariant?: boolean;
  }) => {
    // If no model_id, can't navigate to model page
    // For variant rows without model_id, navigate to variants page
    if (!activity.model_id) {
      if (activity.variant_row_id || activity.isFromVariant) {
        return "/variants";
      }
      return "#";
    }
    
    // If it's from a variant row, navigate to variants tab
    if (activity.variant_row_id || activity.isFromVariant) {
      return `/models/${activity.model_id}?tab=variants`;
    }
    
    // If it's from a model row, navigate with rowId parameter
    if (activity.row_id) {
      return `/models/${activity.model_id}?rowId=${activity.row_id}`;
    }
    
    // Fallback to model page without rowId
    return `/models/${activity.model_id}`;
  };

  // Combine and sort by created_at
  const allActivities = [
    ...images.map(img => ({
      type: "image" as const,
      id: img.id,
      model_id: img.model_id,
      row_id: img.row_id,
      variant_row_id: img.variant_row_id,
      isFromVariant: img.isFromVariant,
      model: img.model,
      created_at: img.created_at,
      thumbnail_url: img.thumbnail_url,
      output_url: img.output_url,
    })),
    ...jobs.map(job => ({
      type: "job" as const,
      id: job.id,
      model_id: job.model_id,
      row_id: job.row_id,
      variant_row_id: job.variant_row_id,
      isFromVariant: !!job.variant_row_id, // Jobs with variant_row_id are from variants
      model: job.model,
      created_at: job.created_at,
      status: job.status,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
   .slice(0, 10); // Show last 10 activities

  if (allActivities.length === 0) {
    return (
      <Card className={cn("border-border/50 shadow-sm", className)}>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Activity className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No recent activity</p>
            <p className="text-xs text-muted-foreground text-center max-w-[200px]">
              Activity from your models and jobs will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-border/50 shadow-sm overflow-hidden", className)}>
      <CardHeader className="pb-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {allActivities.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/30 transition-colors">
          <div className="p-4 space-y-1">
            {allActivities.map((activity, index) => {
              const modelLink = getActivityUrl(activity);

              if (activity.type === "image") {
                return (
                  <Link
                    key={`image-${activity.id}`}
                    href={modelLink}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg",
                      "hover:bg-accent/50 active:bg-accent/70",
                      "transition-all duration-200 ease-in-out",
                      "border border-transparent hover:border-border/50",
                      "group relative",
                      index !== allActivities.length - 1 && "mb-1"
                    )}
                  >
                    <Avatar className="h-11 w-11 flex-shrink-0 ring-2 ring-border/50 group-hover:ring-primary/30 transition-all duration-200">
                      {activity.thumbnail_url || activity.output_url ? (
                        <AvatarImage
                          src={activity.thumbnail_url || activity.output_url || ""}
                          alt="Generated image"
                          className="object-cover"
                        />
                      ) : (
                        <AvatarFallback className="bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <ImageIcon className="h-5 w-5 text-primary" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          Image generated
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {activity.model && (
                          <span className="text-xs text-muted-foreground truncate">
                            {activity.model.name || "Untitled Model"}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          <TimeAgo dateString={activity.created_at} />
                        </span>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className="flex-shrink-0 bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                    >
                      <ImageIcon className="h-3 w-3 mr-1.5" />
                      Image
                    </Badge>
                  </Link>
                );
              }

              return (
                <Link
                  key={`job-${activity.id}`}
                  href={modelLink}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    "hover:bg-accent/50 active:bg-accent/70",
                    "transition-all duration-200 ease-in-out",
                    "border border-transparent hover:border-border/50",
                    "group relative",
                    index !== allActivities.length - 1 && "mb-1"
                  )}
                >
                  <div className="h-11 w-11 flex-shrink-0 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-muted transition-colors ring-2 ring-border/50 group-hover:ring-primary/30 transition-all duration-200">
                    <Loader2 className={cn(
                      "h-5 w-5 text-muted-foreground",
                      activity.status === "running" || activity.status === "saving" ? "animate-spin" : ""
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        Job {activity.status === "succeeded" ? "completed" : activity.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {activity.model && (
                        <>
                          <span className="text-xs text-muted-foreground truncate">
                            {activity.model.name || "Untitled Model"}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(activity.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(activity.status)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        {allActivities.length >= 10 && (
          <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
            <Link
              href="/models"
              className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
            >
              <span>View all activity</span>
              <Activity className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
