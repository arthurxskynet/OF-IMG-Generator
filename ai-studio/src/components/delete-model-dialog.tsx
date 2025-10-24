"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DeleteModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export function DeleteModelDialog({
  open,
  onOpenChange,
  modelName,
  onConfirm,
  isDeleting = false,
}: DeleteModelDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Model
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>&quot;{modelName}&quot;</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              <strong>This will permanently delete:</strong>
            </p>
            <ul className="mt-2 text-sm text-destructive/80 space-y-1">
              <li>• The model and all its configuration</li>
              <li>• All generation rows and their data</li>
              <li>• All generated images and files</li>
              <li>• All associated storage files</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading || isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || isDeleting}
          >
            {(isLoading || isDeleting) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
