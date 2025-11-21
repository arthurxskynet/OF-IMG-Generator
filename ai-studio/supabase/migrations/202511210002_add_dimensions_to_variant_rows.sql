-- Add output dimensions to variant_rows table
-- These dimensions are separate from model dimensions and only affect variant generations

ALTER TABLE variant_rows 
ADD COLUMN IF NOT EXISTS output_width INT DEFAULT 4096,
ADD COLUMN IF NOT EXISTS output_height INT DEFAULT 4096;

-- Add check constraint to ensure dimensions are within valid range (1024-4096)
ALTER TABLE variant_rows
ADD CONSTRAINT variant_rows_output_width_check CHECK (output_width >= 1024 AND output_width <= 4096),
ADD CONSTRAINT variant_rows_output_height_check CHECK (output_height >= 1024 AND output_height <= 4096);

-- Update existing rows to have default dimensions if they don't have them
UPDATE variant_rows 
SET output_width = 4096, output_height = 4096 
WHERE output_width IS NULL OR output_height IS NULL;

