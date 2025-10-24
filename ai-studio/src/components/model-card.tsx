"use client";

import { useState } from "react";
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
  const { toast } = useToast();

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
      <Link href={`/models/${model.id}`}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Avatar className="h-12 w-12 flex-shrink-0">
                {model.signedHeadshotUrl ? (
                  <AvatarImage src={model.signedHeadshotUrl} alt={model.name ?? 'Model'} />
                ) : (
                  <AvatarFallback>{(model.name ?? 'UM').slice(0, 2).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{model.name ?? 'Untitled Model'}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {model.default_prompt}
                    </p>
                  </div>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={handleDeleteClick}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  {showStats ? (
                    <div className="flex space-x-2">
                      <Badge variant="secondary">
                        {model.totalRows || 0} rows
                      </Badge>
                      {model.completedRows && model.completedRows > 0 && (
                        <Badge variant="default">
                          {model.completedRows} done
                        </Badge>
                      )}
                      {model.activeRows && model.activeRows > 0 && (
                        <Badge variant="outline">
                          {model.activeRows} active
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {model.rowCount || 0} rows
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(model.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
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
