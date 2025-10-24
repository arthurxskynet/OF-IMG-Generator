-- Prompt Generation Queue Schema
-- This table manages AI prompt generation as a separate queue from the main job queue

create table if not exists public.prompt_generation_jobs (
  id uuid primary key default uuid_generate_v4(),
  row_id uuid not null references public.model_rows(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ref_urls text[], -- array of reference image URLs
  target_url text not null, -- target image URL
  status text not null default 'queued', -- 'queued'|'processing'|'completed'|'failed'
  generated_prompt text, -- the AI-generated prompt
  error text, -- error message if failed
  retry_count int not null default 0,
  max_retries int not null default 3,
  priority int not null default 5, -- 1-10, higher = more priority
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Add prompt_job_id column to main jobs table to link to prompt generation
alter table public.jobs 
add column if not exists prompt_job_id uuid references public.prompt_generation_jobs(id);

-- Add prompt_status column to jobs table to track prompt generation state
alter table public.jobs 
add column if not exists prompt_status text default 'pending'; -- 'pending'|'generating'|'completed'|'failed'

-- Indexes for performance
create index if not exists idx_prompt_jobs_status_priority on public.prompt_generation_jobs(status, priority desc, created_at asc);
create index if not exists idx_prompt_jobs_user_id on public.prompt_generation_jobs(user_id);
create index if not exists idx_prompt_jobs_row_id on public.prompt_generation_jobs(row_id);
create index if not exists idx_prompt_jobs_created_at on public.prompt_generation_jobs(created_at);
create index if not exists idx_jobs_prompt_job_id on public.jobs(prompt_job_id);
create index if not exists idx_jobs_prompt_status on public.jobs(prompt_status);

-- Function to atomically claim prompt generation jobs
create or replace function public.claim_prompt_jobs(p_limit int)
returns setof public.prompt_generation_jobs
language plpgsql
as $$
declare
begin
  return query
  with to_claim as (
    select id
    from public.prompt_generation_jobs
    where status = 'queued'
    order by priority desc, created_at asc
    limit p_limit
    for update skip locked
  )
  update public.prompt_generation_jobs p
     set status = 'processing',
         started_at = now(),
         updated_at = now()
    from to_claim c
   where p.id = c.id
  returning p.*;
end;
$$;

-- Function to update prompt generation job status
create or replace function public.update_prompt_job_status(
  p_job_id uuid,
  p_status text,
  p_generated_prompt text default null,
  p_error text default null
)
returns void
language plpgsql
as $$
begin
  update public.prompt_generation_jobs
  set status = p_status,
      generated_prompt = p_generated_prompt,
      error = p_error,
      completed_at = case when p_status in ('completed', 'failed') then now() else completed_at end,
      updated_at = now()
  where id = p_job_id;
end;
$$;

-- Function to get prompt queue statistics
create or replace function public.get_prompt_queue_stats()
returns table (
  total_queued bigint,
  total_processing bigint,
  total_completed bigint,
  total_failed bigint,
  avg_wait_time_seconds numeric
)
language plpgsql
as $$
begin
  return query
  select 
    (select count(*) from public.prompt_generation_jobs where status = 'queued') as total_queued,
    (select count(*) from public.prompt_generation_jobs where status = 'processing') as total_processing,
    (select count(*) from public.prompt_generation_jobs where status = 'completed') as total_completed,
    (select count(*) from public.prompt_generation_jobs where status = 'failed') as total_failed,
    (
      select coalesce(avg(extract(epoch from (completed_at - created_at))), 0)
      from public.prompt_generation_jobs 
      where status = 'completed' 
      and completed_at is not null
      and created_at > now() - interval '1 hour'
    ) as avg_wait_time_seconds;
end;
$$;

-- Add constraints for data integrity
alter table public.prompt_generation_jobs 
add constraint chk_prompt_jobs_status 
check (status in ('queued', 'processing', 'completed', 'failed'));

alter table public.prompt_generation_jobs 
add constraint chk_prompt_jobs_priority 
check (priority >= 1 and priority <= 10);

alter table public.prompt_generation_jobs 
add constraint chk_prompt_jobs_retry_count 
check (retry_count >= 0 and retry_count <= max_retries);

alter table public.jobs 
add constraint chk_jobs_prompt_status 
check (prompt_status in ('pending', 'generating', 'completed', 'failed'));

-- Add trigger to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_prompt_generation_jobs_updated_at
  before update on public.prompt_generation_jobs
  for each row execute function public.update_updated_at_column();

-- Grant permissions
grant execute on function public.claim_prompt_jobs(int) to authenticated;
grant execute on function public.update_prompt_job_status(uuid, text, text, text) to authenticated;
grant execute on function public.get_prompt_queue_stats() to authenticated;
grant execute on function public.update_updated_at_column() to authenticated;
