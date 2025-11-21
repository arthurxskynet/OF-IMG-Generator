-- Add match_target_ratio toggle to model_rows to allow overriding output size to match target image aspect ratio
alter table if exists public.model_rows
  add column if not exists match_target_ratio boolean not null default false;

-- Helpful comment for maintainers
comment on column public.model_rows.match_target_ratio is 'When true, generation width/height will be derived from target image aspect ratio at max allowed quality.';


