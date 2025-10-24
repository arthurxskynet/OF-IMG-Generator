-- SQL function to atomically claim jobs for a specific model
-- Run this in your Supabase SQL editor or migrations

create or replace function public.claim_jobs_for_model(p_model_id uuid, p_limit int)
returns setof public.jobs
language plpgsql
as $$
declare
begin
  return query
  with to_claim as (
    select id
    from public.jobs
    where model_id = p_model_id
      and status = 'queued'
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.jobs j
     set status = 'running',
         updated_at = now()
    from to_claim c
   where j.id = c.id
  returning j.*;
end;
$$;

grant execute on function public.claim_jobs_for_model(uuid, int) to authenticated;
