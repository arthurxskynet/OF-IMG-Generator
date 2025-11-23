-- Add job_id column to variant_row_images to track which job created each image
-- This improves duplicate detection and makes variant rows consistent with model rows

ALTER TABLE variant_row_images 
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- Create index for efficient querying by job_id
CREATE INDEX IF NOT EXISTS idx_variant_row_images_job_id 
  ON variant_row_images(job_id);

-- Create composite index for efficient duplicate checking
CREATE INDEX IF NOT EXISTS idx_variant_row_images_variant_job 
  ON variant_row_images(variant_row_id, job_id);

-- Add helpful comment
COMMENT ON COLUMN variant_row_images.job_id IS 
  'The job that generated this image. NULL for reference images or images created before this migration.';

