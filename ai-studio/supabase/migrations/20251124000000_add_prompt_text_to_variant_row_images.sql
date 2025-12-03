-- Add prompt_text column to variant_row_images table
-- This stores the exact prompt used to generate each variant image
-- This makes variant rows consistent with model rows (generated_images.prompt_text)
ALTER TABLE public.variant_row_images 
ADD COLUMN IF NOT EXISTS prompt_text text;

-- Create index for better performance when filtering/searching by prompt
CREATE INDEX IF NOT EXISTS idx_variant_row_images_prompt_text 
ON public.variant_row_images USING gin(to_tsvector('english', prompt_text));

-- Add helpful comment
COMMENT ON COLUMN public.variant_row_images.prompt_text IS 
  'The exact prompt used to generate this image. NULL for reference images or images created before this migration.';

