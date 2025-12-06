-- Change default_ref_headshot_url from single text to array of text[]
-- This allows models to have multiple default reference images

-- Add new column for array of default reference images
alter table if exists public.models
  add column if not exists default_ref_headshot_urls text[];

-- Migrate existing single default_ref_headshot_url to array
-- If default_ref_headshot_url exists and is not null, convert it to array
update public.models
set default_ref_headshot_urls = case 
  when default_ref_headshot_url is not null and default_ref_headshot_url != '' 
  then array[default_ref_headshot_url]
  else null
end
where default_ref_headshot_urls is null;

-- Create index for array column for better query performance
create index if not exists idx_models_default_ref_headshot_urls 
  on public.models using gin (default_ref_headshot_urls);

-- Add comment for maintainers
comment on column public.models.default_ref_headshot_urls is 'Array of default reference image URLs for face swap. Used when model_rows.ref_image_urls is null or empty.';

-- Note: We keep default_ref_headshot_url for backward compatibility during transition
-- It can be removed in a future migration after all code is updated

