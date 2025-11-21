-- Add favorites functionality to variant_row_images
-- This allows users to favorite variant images just like generated_images

-- Add is_favorited boolean column to variant_row_images table
ALTER TABLE variant_row_images 
  ADD COLUMN IF NOT EXISTS is_favorited BOOLEAN NOT NULL DEFAULT false;

-- Create index for better performance when filtering by favorites
CREATE INDEX IF NOT EXISTS idx_variant_row_images_favorited 
  ON variant_row_images(is_favorited);

-- Create index for variant_row_id + is_favorited queries
CREATE INDEX IF NOT EXISTS idx_variant_row_images_row_favorited 
  ON variant_row_images(variant_row_id, is_favorited);

-- Add helpful comment
COMMENT ON COLUMN variant_row_images.is_favorited IS 
  'True if this image is marked as a favorite by the user';

