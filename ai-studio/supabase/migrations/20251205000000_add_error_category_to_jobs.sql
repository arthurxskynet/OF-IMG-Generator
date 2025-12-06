-- Migration: Add error categorization columns to jobs table
-- This adds error_category and error_details columns for better error tracking and user feedback

-- Add error_category column to store the categorized error type
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS error_category text;

-- Add error_details JSONB column to store structured error information
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS error_details jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.error_category IS 'Categorized error type (e.g., credits_insufficient, dimensions_invalid, timeout, etc.)';
COMMENT ON COLUMN public.jobs.error_details IS 'Structured error details including HTTP status, response data, and other context';

-- Create index on error_category for faster queries
CREATE INDEX IF NOT EXISTS idx_jobs_error_category ON public.jobs(error_category) WHERE error_category IS NOT NULL;

-- Extract error category from existing error messages (optional migration of existing data)
-- This extracts the category prefix from error messages in format "category: message"
UPDATE public.jobs
SET 
  error_category = CASE 
    WHEN error LIKE 'credits_insufficient:%' THEN 'credits_insufficient'
    WHEN error LIKE 'quota_exceeded:%' THEN 'quota_exceeded'
    WHEN error LIKE 'dimensions_invalid:%' THEN 'dimensions_invalid'
    WHEN error LIKE 'dimensions_out_of_range:%' THEN 'dimensions_out_of_range'
    WHEN error LIKE 'prompt_empty:%' THEN 'prompt_empty'
    WHEN error LIKE 'prompt_generation_failed:%' THEN 'prompt_generation_failed'
    WHEN error LIKE 'image_missing:%' THEN 'image_missing'
    WHEN error LIKE 'image_path_invalid:%' THEN 'image_path_invalid'
    WHEN error LIKE 'request_malformed:%' THEN 'request_malformed'
    WHEN error LIKE 'network_error:%' THEN 'network_error'
    WHEN error LIKE 'timeout:%' THEN 'timeout'
    WHEN error LIKE 'rate_limited:%' THEN 'rate_limited'
    WHEN error LIKE 'api_bad_request:%' THEN 'api_bad_request'
    WHEN error LIKE 'api_unauthorized:%' THEN 'api_unauthorized'
    WHEN error LIKE 'api_forbidden:%' THEN 'api_forbidden'
    WHEN error LIKE 'api_server_error:%' THEN 'api_server_error'
    WHEN error LIKE 'provider_id_missing:%' THEN 'provider_id_missing'
    WHEN error LIKE 'database_error:%' THEN 'database_error'
    ELSE 'unknown'
  END,
  error_details = jsonb_build_object(
    'original_error', error,
    'migrated_at', now()
  )
WHERE error IS NOT NULL 
  AND error_category IS NULL
  AND status = 'failed';


