-- Migration: Add claim_jobs_with_capacity function
-- This function atomically checks capacity and claims jobs to prevent race conditions
-- It ensures only MAX_CONCURRENCY jobs are active at once within the active window

create or replace function public.claim_jobs_with_capacity(
  p_max_concurrency int,
  p_active_window_ms bigint
)
returns setof public.jobs
language plpgsql
as $$
declare
  v_active_cutoff timestamptz;
  v_active_count int;
  v_available_slots int;
  v_claim_limit int;
begin
  -- Calculate the active cutoff timestamp
  v_active_cutoff := now() - (p_active_window_ms * interval '1 millisecond');
  
  -- Count active jobs (submitted, running, saving) within the active window
  select count(*) into v_active_count
  from public.jobs
  where status in ('submitted', 'running', 'saving')
    and updated_at > v_active_cutoff;
  
  -- Calculate available slots
  v_available_slots := greatest(0, p_max_concurrency - coalesce(v_active_count, 0));
  
  -- If no slots available, return empty result
  if v_available_slots <= 0 then
    return;
  end if;
  
  -- Claim up to available_slots jobs (first come first serve)
  v_claim_limit := v_available_slots;
  
  return query
  with to_claim as (
    select id
    from public.jobs
    where status = 'queued'
    order by created_at asc
    limit v_claim_limit
    for update skip locked
  )
  update public.jobs j
     set status = 'submitted',
         updated_at = now()
    from to_claim c
   where j.id = c.id
  returning j.*;
end;
$$;

grant execute on function public.claim_jobs_with_capacity(int, bigint) to authenticated;

