-- Schema and RLS for multi-tenant AI Studio
begin;

-- Extensions
create extension if not exists "uuid-ossp";

-- Profiles (optional, handy)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

-- Teams and membership
create table if not exists public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- 'owner'|'admin'|'member'
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

-- Models (the persona/config container)
create table if not exists public.models (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references public.teams(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  default_prompt text not null,
  default_ref_headshot_url text, -- signed URL to 'refs' bucket
  size text not null default '2227*3183',
  requests_default int not null default 6,      -- default number of images to request
  created_at timestamptz default now()
);

-- Rows: a "generation row" inside a model (target image + optional per-row prompt)
create table if not exists public.model_rows (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references public.models(id) on delete cascade,
  ref_image_urls text[],           -- array of reference image URLs, defaults to model.default_ref_headshot_url if empty
  target_image_url text,  -- user-provided image (signed URL to 'targets')
  prompt_override text,            -- if null, use model.default_prompt
  match_target_ratio boolean not null default false, -- when true, outputs will match target aspect ratio at max quality
  status text not null default 'idle', -- 'idle'|'queued'|'running'|'partial'|'done'|'error'
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Jobs: each API call to SeeDream-v4/edit
create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  row_id uuid not null references public.model_rows(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_payload jsonb not null,
  provider_request_id text,      -- WaveSpeed requestId
  status text not null default 'queued',  -- 'queued'|'submitted'|'running'|'succeeded'|'failed'
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Generated images (each job may return multiple)
create table if not exists public.generated_images (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  row_id uuid not null references public.model_rows(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  output_url text not null,          -- signed URL in 'outputs'
  width int,
  height int,
  prompt_text text,                  -- the prompt used to generate this image
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_models_team on public.models(team_id);
create index if not exists idx_rows_model on public.model_rows(model_id);
create index if not exists idx_jobs_row on public.jobs(row_id);
create index if not exists idx_jobs_team on public.jobs(team_id);
create index if not exists idx_images_job on public.generated_images(job_id);
create index if not exists idx_images_team on public.generated_images(team_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.models enable row level security;
alter table public.model_rows enable row level security;
alter table public.jobs enable row level security;
alter table public.generated_images enable row level security;

-- helper function to check membership
create or replace function public.is_team_member(uid uuid, tid uuid)
returns boolean language sql as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = tid and tm.user_id = uid
  );
$$;

-- Policies
-- profiles
drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
  for select using (auth.uid() = user_id);
drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update using (auth.uid() = user_id);

-- teams
drop policy if exists "team owner or member can read" on public.teams;
create policy "team owner or member can read" on public.teams
  for select using (owner_id = auth.uid() or public.is_team_member(auth.uid(), id));
drop policy if exists "create team" on public.teams;
create policy "create team" on public.teams
  for insert with check (owner_id = auth.uid());
drop policy if exists "owner can update" on public.teams;
create policy "owner can update" on public.teams
  for update using (owner_id = auth.uid());

-- team_members
drop policy if exists "members read their teams" on public.team_members;
create policy "members read their teams" on public.team_members
  for select using (public.is_team_member(auth.uid(), team_id) or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
drop policy if exists "owner add members" on public.team_members;
create policy "owner add members" on public.team_members
  for insert with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
drop policy if exists "owner remove members" on public.team_members;
create policy "owner remove members" on public.team_members
  for delete using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));

-- models
drop policy if exists "read models if team member or owner" on public.models;
create policy "read models if team member or owner" on public.models
  for select using ((team_id is null and owner_id = auth.uid()) or public.is_team_member(auth.uid(), team_id) or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
drop policy if exists "insert models owner or team owner" on public.models;
create policy "insert models owner or team owner" on public.models
  for insert with check (owner_id = auth.uid() and (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())));
drop policy if exists "update models owner or team owner" on public.models;
create policy "update models owner or team owner" on public.models
  for update using (owner_id = auth.uid() or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
drop policy if exists "delete models owner or team owner" on public.models;
create policy "delete models owner or team owner" on public.models
  for delete using (owner_id = auth.uid() or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));

-- model_rows
drop policy if exists "read rows if member" on public.model_rows;
create policy "read rows if member" on public.model_rows
  for select using (exists (select 1 from public.models m where m.id = model_id and ((m.team_id is null and m.owner_id = auth.uid()) or public.is_team_member(auth.uid(), m.team_id) or exists (select 1 from public.teams t where t.id = m.team_id and t.owner_id = auth.uid()))));
drop policy if exists "insert rows if member" on public.model_rows;
create policy "insert rows if member" on public.model_rows
  for insert with check (exists (select 1 from public.models m where m.id = model_id and ((m.team_id is null and m.owner_id = auth.uid()) or public.is_team_member(auth.uid(), m.team_id) or exists (select 1 from public.teams t where t.id = m.team_id and t.owner_id = auth.uid()))));
drop policy if exists "update rows if member" on public.model_rows;
create policy "update rows if member" on public.model_rows
  for update using (exists (select 1 from public.models m where m.id = model_id and ((m.team_id is null and m.owner_id = auth.uid()) or public.is_team_member(auth.uid(), m.team_id) or exists (select 1 from public.teams t where t.id = m.team_id and t.owner_id = auth.uid()))));
drop policy if exists "delete rows if member" on public.model_rows;
create policy "delete rows if member" on public.model_rows
  for delete using (exists (select 1 from public.models m where m.id = model_id and ((m.team_id is null and m.owner_id = auth.uid()) or public.is_team_member(auth.uid(), m.team_id) or exists (select 1 from public.teams t where t.id = m.team_id and t.owner_id = auth.uid()))));

-- jobs
drop policy if exists "read jobs if member" on public.jobs;
create policy "read jobs if member" on public.jobs
  for select using (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));
drop policy if exists "insert jobs if member" on public.jobs;
create policy "insert jobs if member" on public.jobs
  for insert with check (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));
drop policy if exists "update jobs if member" on public.jobs;
create policy "update jobs if member" on public.jobs
  for update using (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));

-- generated_images
drop policy if exists "read images if member" on public.generated_images;
create policy "read images if member" on public.generated_images
  for select using (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));
drop policy if exists "insert images if member" on public.generated_images;
create policy "insert images if member" on public.generated_images
  for insert with check (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));
drop policy if exists "update images if member" on public.generated_images;
create policy "update images if member" on public.generated_images
  for update using (user_id = auth.uid() or public.is_team_member(auth.uid(), team_id));

commit;


