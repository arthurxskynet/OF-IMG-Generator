-- Migration: add swap_mode column to prompt_generation_jobs
do $$ begin
  -- Add column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prompt_generation_jobs'
      and column_name = 'swap_mode'
  ) then
    alter table public.prompt_generation_jobs
      add column swap_mode text default 'face-hair';
  end if;
end $$;

-- Constrain allowed values (idempotent)
-- Only add constraint if column exists AND constraint doesn't exist
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prompt_generation_jobs'
      and column_name = 'swap_mode'
  ) and not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'prompt_generation_jobs'
      and c.conname = 'chk_prompt_jobs_swap_mode'
  ) then
    alter table public.prompt_generation_jobs
      add constraint chk_prompt_jobs_swap_mode
      check (swap_mode in ('face', 'face-hair'));
  end if;
end $$;


