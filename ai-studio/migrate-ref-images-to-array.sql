-- Migration script to convert ref_image_url to ref_image_urls array
-- Run this script to update existing data to support multiple reference images

-- Step 1: Add the new column
ALTER TABLE public.model_rows 
ADD COLUMN IF NOT EXISTS ref_image_urls text[];

-- Step 2: Migrate existing data from ref_image_url to ref_image_urls
-- Convert single ref_image_url values to arrays
UPDATE public.model_rows 
SET ref_image_urls = CASE 
  WHEN ref_image_url IS NOT NULL AND ref_image_url != '' 
  THEN ARRAY[ref_image_url]
  ELSE NULL
END
WHERE ref_image_urls IS NULL;

-- Step 3: Drop the old column (uncomment when ready to remove the old column)
-- ALTER TABLE public.model_rows DROP COLUMN IF EXISTS ref_image_url;

-- Step 4: Add index for better performance on array operations
CREATE INDEX IF NOT EXISTS idx_model_rows_ref_image_urls 
ON public.model_rows USING GIN (ref_image_urls);

-- Verify the migration
SELECT 
  id,
  ref_image_url,
  ref_image_urls,
  CASE 
    WHEN ref_image_url IS NOT NULL AND ref_image_url != '' 
    THEN ARRAY[ref_image_url] = ref_image_urls
    ELSE ref_image_urls IS NULL
  END as migration_correct
FROM public.model_rows 
LIMIT 10;
