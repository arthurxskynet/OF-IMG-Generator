-- Schema migration for WaveSpeed integration
-- Run this in your Supabase SQL editor or migrations

-- Rename variants_default to requests_default (semantic clarity)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'models'
      and column_name = 'variants_default'
  ) then
    alter table public.models rename column variants_default to requests_default;
  end if;
end
$$;

-- Remove per-model max_concurrency (we hard-cap to 3 in app logic)
alter table public.models drop column if exists max_concurrency;

-- Optional: track a global toggle if needed later (not required)
-- alter table public.models add column is_paused boolean default false;

-- Allow nullable target_image_url to enable creating rows before upload
alter table if exists public.model_rows
  alter column target_image_url drop not null;
