-- Migration: Add user_settings table for tutorial toggle
begin;

-- Create user_settings table
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tutorial_enabled boolean not null default false,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.user_settings enable row level security;

-- RLS Policies
drop policy if exists "user_settings self read" on public.user_settings;
create policy "user_settings self read" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings self insert" on public.user_settings;
create policy "user_settings self insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings self update" on public.user_settings;
create policy "user_settings self update" on public.user_settings
  for update using (auth.uid() = user_id);

-- Create index for faster lookups
create index if not exists idx_user_settings_user on public.user_settings(user_id);

commit;

