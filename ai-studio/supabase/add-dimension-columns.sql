-- Migration: Add output dimension columns to models table
-- This adds width and height fields to replace the unused size field

ALTER TABLE public.models 
  ADD COLUMN IF NOT EXISTS output_width integer NOT NULL DEFAULT 4096,
  ADD COLUMN IF NOT EXISTS output_height integer NOT NULL DEFAULT 4096;

-- Add constraints to ensure dimensions are within valid range (1024-4096)
ALTER TABLE public.models 
  ADD CONSTRAINT check_output_width CHECK (output_width >= 1024 AND output_width <= 4096),
  ADD CONSTRAINT check_output_height CHECK (output_height >= 1024 AND output_height <= 4096);

-- Add comment for documentation
COMMENT ON COLUMN public.models.output_width IS 'Output image width in pixels (1024-4096)';
COMMENT ON COLUMN public.models.output_height IS 'Output image height in pixels (1024-4096)';
