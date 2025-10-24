-- Global job claimer function for safe concurrent claiming across all models
-- Run this in your Supabase SQL editor or migrations

create or replace function public.claim_jobs_global(p_limit int)
returns setof public.jobs
language plpgsql
as $$
declare
begin
  return query
  with to_claim as (
    select id
    from public.jobs
    where status = 'queued'
    order by created_at asc
    limit p_limit
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

grant execute on function public.claim_jobs_global(int) to authenticated;
