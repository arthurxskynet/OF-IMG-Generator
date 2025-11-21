-- Add prompt_text column to generated_images table
-- This stores the exact prompt used to generate each image
ALTER TABLE public.generated_images 
ADD COLUMN IF NOT EXISTS prompt_text text;

-- Create index for better performance when filtering/searching by prompt
CREATE INDEX IF NOT EXISTS idx_generated_images_prompt_text 
ON public.generated_images USING gin(to_tsvector('english', prompt_text));

