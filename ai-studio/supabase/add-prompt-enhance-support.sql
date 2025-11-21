-- Add support for prompt enhancement jobs
alter table public.prompt_generation_jobs
add column if not exists operation text default 'generate', -- 'generate' | 'enhance'
add column if not exists existing_prompt text,
add column if not exists user_instructions text,
add column if not exists enhanced_prompt text;

-- Update constraint for operation type
do $$ begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'prompt_generation_jobs'
      and c.conname = 'chk_prompt_jobs_operation'
  ) then
    alter table public.prompt_generation_jobs
      add constraint chk_prompt_jobs_operation
      check (operation in ('generate', 'enhance'));
  end if;
end $$;

-- Update status update function to handle enhanced_prompt
-- This function now intelligently updates generated_prompt OR enhanced_prompt based on operation type
create or replace function public.update_prompt_job_status(
  p_job_id uuid,
  p_status text,
  p_generated_prompt text default null,
  p_error text default null
)
returns void
language plpgsql
as $$
declare
  v_operation text;
begin
  -- Get the operation type for this job
  select operation into v_operation from public.prompt_generation_jobs where id = p_job_id;

  update public.prompt_generation_jobs
  set status = p_status,
      -- If generating, update generated_prompt. If enhancing, keep existing.
      generated_prompt = case 
        when v_operation = 'generate' and p_generated_prompt is not null then p_generated_prompt 
        else generated_prompt 
      end,
      -- If enhancing, update enhanced_prompt. If generating, keep null/existing.
      enhanced_prompt = case 
        when v_operation = 'enhance' and p_generated_prompt is not null then p_generated_prompt 
        else enhanced_prompt 
      end,
      error = p_error,
      completed_at = case when p_status in ('completed', 'failed') then now() else completed_at end,
      updated_at = now()
  where id = p_job_id;
end;
$$;

