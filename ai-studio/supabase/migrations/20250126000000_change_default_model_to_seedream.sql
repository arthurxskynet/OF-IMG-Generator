-- Change default generation_model from nano-banana-pro-edit to seedream-v4-edit
-- This affects new rows only; existing rows keep their current values

-- Update model_rows table default
ALTER TABLE public.model_rows 
ALTER COLUMN generation_model SET DEFAULT 'seedream-v4-edit';

-- Update variant_rows table default
ALTER TABLE public.variant_rows 
ALTER COLUMN generation_model SET DEFAULT 'seedream-v4-edit';

-- Update column comments to reflect new default
COMMENT ON COLUMN public.model_rows.generation_model IS 
  'WaveSpeed API model to use for image generation. Options: seedream-v4-edit (default), nano-banana-pro-edit';

COMMENT ON COLUMN public.variant_rows.generation_model IS 
  'WaveSpeed API model to use for image generation. Options: seedream-v4-edit (default), nano-banana-pro-edit';

