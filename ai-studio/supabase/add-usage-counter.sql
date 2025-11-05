begin;

create table if not exists public.user_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation_count bigint not null default 0,
  first_generated_at timestamptz,
  last_generated_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.user_usage enable row level security;

-- RLS: users can manage only their own usage row
drop policy if exists "read own usage" on public.user_usage;
create policy "read own usage" on public.user_usage
  for select using (auth.uid() = user_id);

drop policy if exists "insert own usage" on public.user_usage;
create policy "insert own usage" on public.user_usage
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own usage" on public.user_usage;
create policy "update own usage" on public.user_usage
  for update using (auth.uid() = user_id);

-- Atomic increment via upsert
create or replace function public.increment_generation_count(step int default 1)
returns table (generation_count bigint) language plpgsql as $$
begin
  insert into public.user_usage (user_id, generation_count, first_generated_at, last_generated_at)
  values (auth.uid(), step, now(), now())
  on conflict (user_id)
  do update set
    generation_count = public.user_usage.generation_count + excluded.generation_count,
    last_generated_at = now(),
    updated_at = now()
  returning public.user_usage.generation_count into generation_count;
  return;
end; $$;

commit;


