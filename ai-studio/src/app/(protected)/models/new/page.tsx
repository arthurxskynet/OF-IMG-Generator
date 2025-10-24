"use client";
import { useState, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { uploadImage, validateFile } from "@/lib/client-upload";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase-browser";
import dynamic from "next/dynamic";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  default_prompt: z.string().min(3, "Default prompt must be at least 3 characters"),
  requests_default: z.number().int().min(1).max(50),
});

type FormValues = z.infer<typeof schema>;

const Page = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedHeadshot, setUploadedHeadshot] = useState<string | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ 
    resolver: zodResolver(schema),
    defaultValues: {
      requests_default: 6,
      default_prompt: "Take the face and hair from the person in the first image and perfectly put it on the person in the second image, keep everything else the same."
    }
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Validate file
      validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10);
      
      // Show preview
      const previewUrl = URL.createObjectURL(file);
      setHeadshotPreview(previewUrl);

      // Upload to Supabase Storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      const result = await uploadImage(file, 'refs', user.id);
      setUploadedHeadshot(result.objectPath);
      
      toast({
        title: "Image uploaded",
        description: "Headshot image uploaded successfully"
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive"
      });
      setHeadshotPreview(null);
      setUploadedHeadshot(null);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!uploadedHeadshot) {
      toast({
        title: "Missing headshot",
        description: "Please upload a headshot image",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/models", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          default_ref_headshot_path: uploadedHeadshot
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create model");
      }

      toast({
        title: "Model created",
        description: "Your model has been created successfully"
      });

      window.location.assign("/models");
    } catch (error) {
      console.error("Create model error:", error);
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Failed to create model",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New model</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label htmlFor="name">Model Name</Label>
              <Input id="name" placeholder="Enter model name" {...register("name")} />
              {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="headshot">Headshot Image (Required)</Label>
              <div className="flex items-center space-x-4 mt-2">
                <Avatar className="h-16 w-16">
                  {headshotPreview ? (
                    <AvatarImage src={headshotPreview} alt="Headshot preview" />
                  ) : (
                    <AvatarFallback>IMG</AvatarFallback>
                  )}
                </Avatar>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Image
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPEG, PNG, WebP up to 10MB
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div>
              <Label htmlFor="default_prompt">Default Prompt</Label>
              <Textarea 
                id="default_prompt"
                placeholder="Enter the default prompt for this model" 
                rows={5} 
                {...register("default_prompt")} 
              />
              {errors.default_prompt && <p className="text-xs text-red-600">{errors.default_prompt.message}</p>}
            </div>

            <div>
              <Label htmlFor="requests_default">Default Generation Count</Label>
              <Input 
                id="requests_default"
                type="number" 
                min="1" 
                max="50"
                placeholder="6"
                {...register("requests_default", { valueAsNumber: true })} 
              />
              {errors.requests_default && <p className="text-xs text-red-600">{errors.requests_default.message}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Number of images to generate per request (1-50)
              </p>
            </div>

            <Button type="submit" disabled={isLoading || !uploadedHeadshot}>
              {isLoading ? "Creating..." : "Create Model"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default dynamic(() => Promise.resolve(Page), { ssr: false });


