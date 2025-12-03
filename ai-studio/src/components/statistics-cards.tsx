"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { 
  FolderOpen, 
  Image as ImageIcon, 
  Layers, 
  Zap,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatisticsCardsProps {
  stats: {
    totalModels: number;
    totalImages: number;
    totalRows: number;
    activeJobs: number;
  };
  className?: string;
}

const statConfig = [
  {
    label: "Total Models",
    value: "totalModels",
    icon: FolderOpen,
    href: "/models",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    label: "Images Generated",
    value: "totalImages",
    icon: ImageIcon,
    href: "/models",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    label: "Total Rows",
    value: "totalRows",
    icon: Layers,
    href: "/models",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    label: "Active Jobs",
    value: "activeJobs",
    icon: Zap,
    href: "/models",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
] as const;

export function StatisticsCards({ stats, className }: StatisticsCardsProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {statConfig.map((stat) => {
        const Icon = stat.icon;
        const value = stats[stat.value as keyof typeof stats];
        const isClickable = stat.href && (stat.value !== "activeJobs" || value > 0);

        const content = (
          <Card className="hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/20 group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      stat.bgColor
                    )}>
                      <Icon className={cn("h-5 w-5", stat.color)} />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold tracking-tight">
                      {value.toLocaleString()}
                    </p>
                  </div>
                </div>
                {isClickable && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </CardContent>
          </Card>
        );

        if (isClickable && stat.href) {
          return (
            <Link key={stat.value} href={stat.href} className="block">
              {content}
            </Link>
          );
        }

        return <div key={stat.value}>{content}</div>;
      })}
    </div>
  );
}


