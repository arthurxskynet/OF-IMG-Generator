"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileUpdateSchema } from "@/lib/validations";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Upload, Loader2 } from "lucide-react";
import { ChangeEmailDialog } from "./change-email-dialog";

interface ProfileData {
  email: string;
  full_name: string;
  avatar_url: string | null;
}

interface ProfileSectionProps {
  initialData: ProfileData;
}

export function ProfileSection({ initialData }: ProfileSectionProps) {
  const [profileData, setProfileData] = useState<ProfileData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      full_name: profileData.full_name,
    },
  });

  useEffect(() => {
    reset({ full_name: profileData.full_name });
  }, [profileData.full_name, reset]);

  const onSubmit = async (data: { full_name: string }) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile");
      }

      const result = await response.json();
      setProfileData((prev) => ({ ...prev, full_name: result.full_name }));

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, WebP, or GIF image.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Avatar must be less than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/user/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload avatar");
      }

      const result = await response.json();
      setProfileData((prev) => ({ ...prev, avatar_url: result.avatar_url }));

      toast({
        title: "Avatar updated",
        description: "Your avatar has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
      // Reset input
      event.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    try {
      const response = await fetch("/api/user/profile/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove avatar");
      }

      setProfileData((prev) => ({ ...prev, avatar_url: null }));

      toast({
        title: "Avatar removed",
        description: "Your avatar has been removed.",
      });
    } catch (error) {
      toast({
        title: "Remove failed",
        description: error instanceof Error ? error.message : "Failed to remove avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const getInitials = (name: string, email: string) => {
    if (name) {
      return name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase())
        .join("")
        .slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || "U";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Update your personal details, avatar, and contact information.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center gap-6">
          <Avatar className="size-20">
            {profileData.avatar_url ? (
              <AvatarImage src={profileData.avatar_url} alt="Avatar" />
            ) : null}
            <AvatarFallback>
              {getInitials(profileData.full_name, profileData.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" asChild disabled={isUploadingAvatar}>
                  <span>
                    {isUploadingAvatar ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="size-4 mr-2" />
                        Upload
                      </>
                    )}
                  </span>
                </Button>
              </Label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
              {profileData.avatar_url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP or GIF. Max size 5MB.
            </p>
          </div>
        </div>

        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            {...register("full_name")}
            placeholder="Enter your full name"
          />
          {errors.full_name && (
            <p className="text-sm text-destructive">{errors.full_name.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="flex gap-2">
            <Input
              id="email"
              type="email"
              value={profileData.email}
              disabled
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmailDialog(true)}
            >
              Change
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Email changes require confirmation.
          </p>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={isSubmitting || isLoading}>
          {isSubmitting || isLoading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </form>

      <ChangeEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        currentEmail={profileData.email}
        onEmailUpdated={(newEmail) => {
          setProfileData((prev) => ({ ...prev, email: newEmail }));
        }}
      />
    </div>
  );
}

