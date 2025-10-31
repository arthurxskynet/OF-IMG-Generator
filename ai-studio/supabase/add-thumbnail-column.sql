-- Add thumbnail_url column to generated_images table
ALTER TABLE public.generated_images 
ADD COLUMN IF NOT EXISTS thumbnail_url text;


