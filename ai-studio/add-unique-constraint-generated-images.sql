-- Add unique constraint to prevent duplicate image saves
-- Run this in your Supabase SQL editor

-- Add unique constraint on (job_id, output_url) to prevent duplicate images
-- This ensures that the same job cannot save the same output URL twice
-- First check if constraint already exists, then add it if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_job_output_url' 
        AND conrelid = 'public.generated_images'::regclass
    ) THEN
        ALTER TABLE public.generated_images 
        ADD CONSTRAINT unique_job_output_url 
        UNIQUE (job_id, output_url);
    END IF;
END $$;

-- Create index for better performance on the unique constraint
-- This index will also be used for the unique constraint
CREATE INDEX IF NOT EXISTS idx_generated_images_job_output 
ON public.generated_images(job_id, output_url);

-- Verify the constraint was added
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.generated_images'::regclass 
AND conname = 'unique_job_output_url';
