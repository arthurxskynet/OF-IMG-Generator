-- Add match_target_ratio column to variant_rows table
-- When enabled, output dimensions will match the target image aspect ratio at maximum quality

ALTER TABLE variant_rows 
ADD COLUMN IF NOT EXISTS match_target_ratio BOOLEAN NOT NULL DEFAULT false;


