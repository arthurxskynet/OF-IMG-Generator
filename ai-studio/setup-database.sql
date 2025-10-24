-- Complete database setup for AI Studio
-- Run this entire script in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up any existing test user to avoid conflicts
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'passarthur2003@icloud.com'
);
DELETE FROM auth.users WHERE email = 'passarthur2003@icloud.com';

-- Create tables (from schema.sql)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_prompt text NOT NULL,
  default_ref_headshot_url text,
  size text NOT NULL DEFAULT '2227*3183',
  requests_default int NOT NULL DEFAULT 6,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.model_rows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  ref_image_urls text[],
  target_image_url text NOT NULL,
  prompt_override text,
  status text NOT NULL DEFAULT 'idle',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  row_id uuid NOT NULL REFERENCES public.model_rows(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_payload jsonb NOT NULL,
  provider_request_id text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generated_images (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES public.model_rows(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  output_url text NOT NULL,
  width int,
  height int,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_models_team ON public.models(team_id);
CREATE INDEX IF NOT EXISTS idx_rows_model ON public.model_rows(model_id);
CREATE INDEX IF NOT EXISTS idx_jobs_row ON public.jobs(row_id);
CREATE INDEX IF NOT EXISTS idx_jobs_team ON public.jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_images_job ON public.generated_images(job_id);
CREATE INDEX IF NOT EXISTS idx_images_team ON public.generated_images(team_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_team_member(uid uuid, tid uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = tid AND tm.user_id = uid
  );
$$;

-- RLS Policies
-- Profiles
DROP POLICY IF EXISTS "profiles self" ON public.profiles;
CREATE POLICY "profiles self" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles insert self" ON public.profiles;
CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Teams
DROP POLICY IF EXISTS "team owner or member can read" ON public.teams;
CREATE POLICY "team owner or member can read" ON public.teams
  FOR SELECT USING (owner_id = auth.uid() OR public.is_team_member(auth.uid(), id));
DROP POLICY IF EXISTS "create team" ON public.teams;
CREATE POLICY "create team" ON public.teams
  FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "owner can update" ON public.teams;
CREATE POLICY "owner can update" ON public.teams
  FOR UPDATE USING (owner_id = auth.uid());

-- Team members
DROP POLICY IF EXISTS "members read their teams" ON public.team_members;
CREATE POLICY "members read their teams" ON public.team_members
  FOR SELECT USING (public.is_team_member(auth.uid(), team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));
DROP POLICY IF EXISTS "owner add members" ON public.team_members;
CREATE POLICY "owner add members" ON public.team_members
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));
DROP POLICY IF EXISTS "owner remove members" ON public.team_members;
CREATE POLICY "owner remove members" ON public.team_members
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));

-- Models
DROP POLICY IF EXISTS "read models if team member or owner" ON public.models;
CREATE POLICY "read models if team member or owner" ON public.models
  FOR SELECT USING ((team_id IS NULL AND owner_id = auth.uid()) OR public.is_team_member(auth.uid(), team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));
DROP POLICY IF EXISTS "insert models owner or team owner" ON public.models;
CREATE POLICY "insert models owner or team owner" ON public.models
  FOR INSERT WITH CHECK (owner_id = auth.uid() AND (team_id IS NULL OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())));
DROP POLICY IF EXISTS "update models owner or team owner" ON public.models;
CREATE POLICY "update models owner or team owner" ON public.models
  FOR UPDATE USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));
DROP POLICY IF EXISTS "delete models owner or team owner" ON public.models;
CREATE POLICY "delete models owner or team owner" ON public.models
  FOR DELETE USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));

-- Model rows
DROP POLICY IF EXISTS "read rows if member" ON public.model_rows;
CREATE POLICY "read rows if member" ON public.model_rows
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.models m WHERE m.id = model_id AND ((m.team_id IS NULL AND m.owner_id = auth.uid()) OR public.is_team_member(auth.uid(), m.team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid()))));
DROP POLICY IF EXISTS "insert rows if member" ON public.model_rows;
CREATE POLICY "insert rows if member" ON public.model_rows
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.models m WHERE m.id = model_id AND ((m.team_id IS NULL AND m.owner_id = auth.uid()) OR public.is_team_member(auth.uid(), m.team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid()))));
DROP POLICY IF EXISTS "update rows if member" ON public.model_rows;
CREATE POLICY "update rows if member" ON public.model_rows
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.models m WHERE m.id = model_id AND ((m.team_id IS NULL AND m.owner_id = auth.uid()) OR public.is_team_member(auth.uid(), m.team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid()))));
DROP POLICY IF EXISTS "delete rows if member" ON public.model_rows;
CREATE POLICY "delete rows if member" ON public.model_rows
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.models m WHERE m.id = model_id AND ((m.team_id IS NULL AND m.owner_id = auth.uid()) OR public.is_team_member(auth.uid(), m.team_id) OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid()))));

-- Jobs
DROP POLICY IF EXISTS "read jobs if member" ON public.jobs;
CREATE POLICY "read jobs if member" ON public.jobs
  FOR SELECT USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "insert jobs if member" ON public.jobs;
CREATE POLICY "insert jobs if member" ON public.jobs
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "update jobs if member" ON public.jobs;
CREATE POLICY "update jobs if member" ON public.jobs
  FOR UPDATE USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));

-- Generated images
DROP POLICY IF EXISTS "read images if member" ON public.generated_images;
CREATE POLICY "read images if member" ON public.generated_images
  FOR SELECT USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "insert images if member" ON public.generated_images;
CREATE POLICY "insert images if member" ON public.generated_images
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "update images if member" ON public.generated_images;
CREATE POLICY "update images if member" ON public.generated_images
  FOR UPDATE USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id));

-- Create claim jobs function
CREATE OR REPLACE FUNCTION public.claim_jobs_for_model(p_model_id uuid, p_limit int)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
DECLARE
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT id
    FROM public.jobs
    WHERE model_id = p_model_id
      AND status = 'queued'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.jobs j
     SET status = 'submitted',
         updated_at = now()
    FROM to_claim c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_jobs_for_model(uuid, int) TO authenticated;

-- Global job claimer function for safe concurrent claiming across all models
CREATE OR REPLACE FUNCTION public.claim_jobs_global(p_limit int)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
DECLARE
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.jobs j
     SET status = 'submitted',
         updated_at = now()
    FROM to_claim c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_jobs_global(int) TO authenticated;

-- Utility: mark multiple rows as running when jobs claimed
CREATE OR REPLACE FUNCTION public.mark_rows_running(p_row_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.model_rows
     SET status = 'running'
   WHERE id = ANY(p_row_ids)
     AND status IN ('idle', 'queued');
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_rows_running(uuid[]) TO authenticated;

-- Create test user with proper auth structure
DO $$
DECLARE
  v_email text := 'passarthur2003@icloud.com';
  v_password text := 'Test123!@#';
  v_user_id uuid;
BEGIN
  -- Insert user
  INSERT INTO auth.users (
    id,
    instance_id,
    role,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    last_sign_in_at,
    confirmation_sent_at
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    '{}'::jsonb,
    false,
    now(),
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  -- Insert identity
  INSERT INTO auth.identities (
    id,
    provider,
    provider_id,
    user_id,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    'email',
    v_email,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    now(),
    now(),
    now()
  );

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (v_user_id, 'Test User');

  RAISE NOTICE 'Created user with ID: %', v_user_id;
END $$;

