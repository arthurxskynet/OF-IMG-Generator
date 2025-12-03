-- Add generation_model column to model_rows table
-- This stores which WaveSpeed API model to use for image generation
-- Default is 'nano-banana-pro-edit' (Google Nano Banana Pro Edit)
ALTER TABLE public.model_rows 
ADD COLUMN IF NOT EXISTS generation_model text DEFAULT 'nano-banana-pro-edit';

-- Add check constraint to ensure valid model values
ALTER TABLE public.model_rows
DROP CONSTRAINT IF EXISTS model_rows_generation_model_check;

ALTER TABLE public.model_rows
ADD CONSTRAINT model_rows_generation_model_check 
CHECK (generation_model IN ('nano-banana-pro-edit', 'seedream-v4-edit'));

-- Update existing rows to have default value if null
UPDATE public.model_rows 
SET generation_model = 'nano-banana-pro-edit' 
WHERE generation_model IS NULL;

-- Add helpful comment
COMMENT ON COLUMN public.model_rows.generation_model IS 
  'WaveSpeed API model to use for image generation. Options: nano-banana-pro-edit (default), seedream-v4-edit';

