-- Migration to support variant rows in jobs table
-- Makes row_id nullable and adds variant_row_id field

-- Step 1: Make row_id nullable (variant jobs don't have model_rows)
ALTER TABLE public.jobs 
  ALTER COLUMN row_id DROP NOT NULL;

-- Step 2: Add variant_row_id column for variant row references
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS variant_row_id UUID REFERENCES variant_rows(id) ON DELETE CASCADE;

-- Step 3: Add index for variant_row_id
CREATE INDEX IF NOT EXISTS idx_jobs_variant_row ON public.jobs(variant_row_id);

-- Step 4: Add check constraint to ensure at least one row_id or variant_row_id is set
ALTER TABLE public.jobs 
  ADD CONSTRAINT jobs_row_or_variant_check 
  CHECK (
    (row_id IS NOT NULL AND variant_row_id IS NULL) OR 
    (row_id IS NULL AND variant_row_id IS NOT NULL)
  );

