"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { DeleteModelDialog } from "@/components/delete-model-dialog";
import { useToast } from "@/hooks/use-toast";

interface ModelCardProps {
  model: {
    id: string;
    name: string | null;
    default_prompt: string | null;
    signedHeadshotUrl?: string | null;
    created_at: string;
    rowCount?: number;
    totalRows?: number;
    completedRows?: number;
    activeRows?: number;
    totalRequests?: number;
    size?: string | null;
  };
  showStats?: boolean;
  onDelete?: (modelId: string) => void;
}

export function ModelCard({ model, showStats = false, onDelete }: ModelCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>("");
  const { toast } = useToast();

  // Format date client-only to avoid hydration mismatch
  useEffect(() => {
    const formatted = new Date(model.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    setFormattedDate(formatted);
  }, [model.created_at]);

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/models/${model.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete model");
      }

      const result = await response.json();
      
      // Optimistic UI update
      onDelete(model.id);
      
      toast({
        title: "Model deleted",
        description: `Successfully deleted "${model.name || 'Untitled Model'}" and all associated data.`,
      });
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete model",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Link href={`/models/${model.id}`} data-tour="models-item">
        <Card className="hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer h-full border-border/50 hover:border-primary/20 group">
          <CardContent className="p-5">
            <div className="flex items-start space-x-4">
              <Avatar className="h-14 w-14 flex-shrink-0 ring-2 ring-border/50 group-hover:ring-primary/30 transition-all duration-300">
                {model.signedHeadshotUrl && !imageError ? (
                  <AvatarImage 
                    src={model.signedHeadshotUrl} 
                    alt={model.name ?? 'Model'} 
                    className="object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                    {(model.name ?? 'UM').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                      {model.name ?? 'Untitled Model'}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">
                      {model.default_prompt || 'No default prompt'}
                    </p>
                  </div>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                      onClick={handleDeleteClick}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  {showStats ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-xs font-medium shadow-sm">
                        {model.totalRows || 0} rows
                      </Badge>
                      {model.completedRows && model.completedRows > 0 && (
                        <Badge variant="default" className="text-xs font-medium shadow-sm bg-green-500 hover:bg-green-600">
                          {model.completedRows} done
                        </Badge>
                      )}
                      {model.activeRows && model.activeRows > 0 && (
                        <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary">
                          {model.activeRows} active
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      {model.rowCount || 0} rows
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground/70 font-medium">
                    {formattedDate || ""}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {onDelete && (
        <DeleteModelDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          modelName={model.name || 'Untitled Model'}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
}
