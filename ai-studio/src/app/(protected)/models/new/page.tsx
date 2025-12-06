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
import { X } from "lucide-react";
import { uploadImage, validateFile } from "@/lib/client-upload";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase-browser";
import dynamic from "next/dynamic";
import { getDimensionPresets } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  default_prompt: z.string().min(3, "Default prompt must be at least 3 characters"),
  requests_default: z.number().int().min(1).max(50),
  output_width: z.number().int().min(1024).max(4096),
  output_height: z.number().int().min(1024).max(4096)
});

type FormValues = z.infer<typeof schema>;

const Page = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedHeadshots, setUploadedHeadshots] = useState<string[]>([]);
  const [headshotPreviews, setHeadshotPreviews] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<{width: number, height: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const supabase = createClient();
  const presets = getDimensionPresets();

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormValues>({ 
    resolver: zodResolver(schema),
    defaultValues: {
      requests_default: 6,
      default_prompt: "Take the face and hair from the person in the first image and perfectly put it on the person in the second image, keep everything else the same.",
      output_width: 4096,
      output_height: 4096
    }
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload images",
        variant: "destructive"
      });
      return;
    }

    const fileArray = Array.from(files);
    const newPreviews: string[] = [];
    const uploadPromises: Promise<{ objectPath: string }>[] = [];

    // Validate all files first
    for (const file of fileArray) {
      try {
        validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 50);
        const previewUrl = URL.createObjectURL(file);
        newPreviews.push(previewUrl);
        uploadPromises.push(uploadImage(file, 'refs', user.id));
      } catch (error) {
        toast({
          title: "Invalid file",
          description: error instanceof Error ? error.message : "One or more files are invalid",
          variant: "destructive"
        });
        // Clean up previews on error
        newPreviews.forEach(url => URL.revokeObjectURL(url));
        return;
      }
    }

    // Show all previews
    setHeadshotPreviews(prev => [...prev, ...newPreviews]);

    try {
      // Upload all files in parallel
      const results = await Promise.all(uploadPromises);
      const newPaths = results.map(r => r.objectPath);
      setUploadedHeadshots(prev => [...prev, ...newPaths]);
      
      toast({
        title: "Images uploaded",
        description: `${fileArray.length} image${fileArray.length > 1 ? 's' : ''} uploaded successfully`
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images",
        variant: "destructive"
      });
      // Clean up previews on error
      newPreviews.forEach(url => URL.revokeObjectURL(url));
      setHeadshotPreviews(prev => prev.slice(0, prev.length - newPreviews.length));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeHeadshot = (index: number) => {
    setUploadedHeadshots(prev => prev.filter((_, i) => i !== index));
    const previewToRevoke = headshotPreviews[index];
    if (previewToRevoke) {
      URL.revokeObjectURL(previewToRevoke);
    }
    setHeadshotPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    if (uploadedHeadshots.length === 0) {
      toast({
        title: "Missing headshots",
        description: "Please upload at least one headshot image",
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
          default_ref_headshot_paths: uploadedHeadshots
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

      // Preserve tutorial if running
      const params = new URLSearchParams(window.location.search);
      const dest = params.get("tour") === "1" ? "/models?tour=1" : "/models";
      window.location.assign(dest);
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
              <Input id="name" placeholder="Enter model name" {...register("name")} data-tour="new-model-name" />
              {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="headshot">Default Reference Images (Required)</Label>
              <div className="mt-2 space-y-3">
                {headshotPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {headshotPreviews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden border border-border">
                          <img 
                            src={preview} 
                            alt={`Reference ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeHeadshot(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-tour="new-model-headshot"
                  >
                    {headshotPreviews.length === 0 ? 'Choose Images' : 'Add More Images'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPEG, PNG, WebP up to 50MB each. You can select multiple images.
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
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

            <div>
              <Label>Output Dimensions</Label>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="output_width" className="text-xs">Width (px)</Label>
                    <Input 
                      id="output_width"
                      type="number" 
                      min="1024" 
                      max="4096"
                      step="64"
                      placeholder="4096"
                      {...register("output_width", { valueAsNumber: true })} 
                    />
                    {errors.output_width && <p className="text-xs text-red-600">{errors.output_width.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="output_height" className="text-xs">Height (px)</Label>
                    <Input 
                      id="output_height"
                      type="number" 
                      min="1024" 
                      max="4096"
                      step="64"
                      placeholder="4096"
                      {...register("output_height", { valueAsNumber: true })} 
                    />
                    {errors.output_height && <p className="text-xs text-red-600">{errors.output_height.message}</p>}
                  </div>
                </div>
                
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-sm font-medium mb-2">Current: {selectedPreset ? `${selectedPreset.width} × ${selectedPreset.height}px` : '4096 × 4096px'}</div>
                  <div className="text-xs text-muted-foreground">
                    Total pixels: {selectedPreset ? (selectedPreset.width * selectedPreset.height).toLocaleString() : '16,777,216'}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Quick Presets</Label>
                  <div className="space-y-2">
                    {presets.map((category) => (
                      <div key={category.label}>
                        <div className="text-xs text-muted-foreground font-medium mb-1">
                          {category.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {category.presets.map((preset) => (
                            <Button
                              key={`${preset.width}x${preset.height}`}
                              type="button"
                              variant={selectedPreset?.width === preset.width && selectedPreset?.height === preset.height ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedPreset({ width: preset.width, height: preset.height })
                                setValue("output_width", preset.width)
                                setValue("output_height", preset.height)
                              }}
                              className="text-xs h-6 px-2 transition-all duration-200 hover:scale-105"
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isLoading || uploadedHeadshots.length === 0} data-tour="new-model-submit">
              {isLoading ? "Creating..." : "Create Model"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default dynamic(() => Promise.resolve(Page), { ssr: false });


