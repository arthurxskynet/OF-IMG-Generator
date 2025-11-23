"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailUpdateSchema } from "@/lib/validations";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  onEmailUpdated: (newEmail: string) => void;
}

export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onEmailUpdated,
}: ChangeEmailDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(emailUpdateSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: { email: string; password: string }) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/user/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update email");
      }

      const result = await response.json();
      onEmailUpdated(result.email);
      reset();
      onOpenChange(false);

      toast({
        title: "Email update initiated",
        description: result.message || "Please check your new email inbox for confirmation.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update email",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Email Address</DialogTitle>
          <DialogDescription>
            Enter your new email address and current password. A confirmation email will be sent to your new address.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-email">Current Email</Label>
            <Input id="current-email" type="email" value={currentEmail} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">New Email</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="new@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Current Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your current password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Email"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

