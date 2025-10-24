-- Add favorites functionality to generated images
-- Run this in your Supabase SQL editor

-- Add is_favorited boolean column to generated_images table
ALTER TABLE public.generated_images 
ADD COLUMN IF NOT EXISTS is_favorited boolean DEFAULT false;

-- Create index for better performance when filtering by favorites
CREATE INDEX IF NOT EXISTS idx_generated_images_favorited 
ON public.generated_images(is_favorited);

-- Create index for user-specific favorites queries
CREATE INDEX IF NOT EXISTS idx_generated_images_user_favorited 
ON public.generated_images(user_id, is_favorited);
