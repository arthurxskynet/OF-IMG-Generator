-- Update RLS policies to allow admin access
-- Run this after the admin migration

-- Helper function to check admin status (already created in migration)
-- This is just for reference

-- ============================================
-- PROFILES POLICIES
-- ============================================
DROP POLICY IF EXISTS "profiles self" ON public.profiles;
CREATE POLICY "profiles self or admin" ON public.profiles
  FOR SELECT USING (
    auth.uid() = user_id OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "profiles insert self" ON public.profiles;
CREATE POLICY "profiles insert self or admin" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY "profiles update self or admin" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = user_id OR public.is_admin_user()
  );

-- ============================================
-- TEAMS POLICIES
-- ============================================
DROP POLICY IF EXISTS "team owner or member can read" ON public.teams;
CREATE POLICY "team owner or member or admin can read" ON public.teams
  FOR SELECT USING (
    owner_id = auth.uid() 
    OR public.is_team_member(auth.uid(), id) 
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "create team" ON public.teams;
CREATE POLICY "create team or admin" ON public.teams
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "owner can update" ON public.teams;
CREATE POLICY "owner or admin can update" ON public.teams
  FOR UPDATE USING (
    owner_id = auth.uid() OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "owner can delete" ON public.teams;
CREATE POLICY "owner or admin can delete" ON public.teams
  FOR DELETE USING (
    owner_id = auth.uid() OR public.is_admin_user()
  );

-- ============================================
-- TEAM MEMBERS POLICIES
-- ============================================
DROP POLICY IF EXISTS "members read their teams" ON public.team_members;
CREATE POLICY "members or admin read their teams" ON public.team_members
  FOR SELECT USING (
    public.is_team_member(auth.uid(), team_id) 
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "owner add members" ON public.team_members;
CREATE POLICY "owner or admin add members" ON public.team_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "owner remove members" ON public.team_members;
CREATE POLICY "owner or admin remove members" ON public.team_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

-- ============================================
-- MODELS POLICIES
-- ============================================
DROP POLICY IF EXISTS "read models if team member or owner" ON public.models;
CREATE POLICY "read models if team member or owner or admin" ON public.models
  FOR SELECT USING (
    (team_id IS NULL AND owner_id = auth.uid()) 
    OR public.is_team_member(auth.uid(), team_id) 
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "insert models owner or team owner" ON public.models;
CREATE POLICY "insert models owner or team owner or admin" ON public.models
  FOR INSERT WITH CHECK (
    (owner_id = auth.uid() AND (team_id IS NULL OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())))
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "update models owner or team owner" ON public.models;
CREATE POLICY "update models owner or team owner or admin" ON public.models
  FOR UPDATE USING (
    owner_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "delete models owner or team owner" ON public.models;
CREATE POLICY "delete models owner or team owner or admin" ON public.models
  FOR DELETE USING (
    owner_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_admin_user()
  );

-- ============================================
-- MODEL ROWS POLICIES
-- ============================================
DROP POLICY IF EXISTS "read rows if member" ON public.model_rows;
CREATE POLICY "read rows if member or admin" ON public.model_rows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "insert rows if member" ON public.model_rows;
CREATE POLICY "insert rows if member or admin" ON public.model_rows
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "update rows if member" ON public.model_rows;
CREATE POLICY "update rows if member or admin" ON public.model_rows
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "delete rows if member" ON public.model_rows;
CREATE POLICY "delete rows if member or admin" ON public.model_rows
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR public.is_admin_user()
  );

-- ============================================
-- JOBS POLICIES
-- ============================================
DROP POLICY IF EXISTS "read jobs if member" ON public.jobs;
CREATE POLICY "read jobs if member or admin" ON public.jobs
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "insert jobs if member" ON public.jobs;
CREATE POLICY "insert jobs if member or admin" ON public.jobs
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "update jobs if member" ON public.jobs;
CREATE POLICY "update jobs if member or admin" ON public.jobs
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "delete jobs if member" ON public.jobs;
CREATE POLICY "delete jobs if member or admin" ON public.jobs
  FOR DELETE USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

-- ============================================
-- GENERATED IMAGES POLICIES
-- ============================================
DROP POLICY IF EXISTS "read images if member" ON public.generated_images;
CREATE POLICY "read images if member or admin" ON public.generated_images
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "insert images if member" ON public.generated_images;
CREATE POLICY "insert images if member or admin" ON public.generated_images
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "update images if member" ON public.generated_images;
CREATE POLICY "update images if member or admin" ON public.generated_images
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "delete images if member" ON public.generated_images;
CREATE POLICY "delete images if member or admin" ON public.generated_images
  FOR DELETE USING (
    user_id = auth.uid() 
    OR public.is_team_member(auth.uid(), team_id)
    OR public.is_admin_user()
  );

-- ============================================
-- VARIANT ROWS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view their own variant rows or model variants" ON variant_rows;
CREATE POLICY "Users can view their own variant rows or model variants or admin" ON variant_rows
  FOR SELECT
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own variant rows or model variants" ON variant_rows;
CREATE POLICY "Users can insert their own variant rows or model variants or admin" ON variant_rows
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own variant rows or model variants" ON variant_rows;
CREATE POLICY "Users can update their own variant rows or model variants or admin" ON variant_rows
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their own variant rows or model variants" ON variant_rows;
CREATE POLICY "Users can delete their own variant rows or model variants or admin" ON variant_rows
  FOR DELETE
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        (m.team_id IS NULL AND m.owner_id = auth.uid()) 
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

-- ============================================
-- VARIANT ROW IMAGES POLICIES
-- ============================================
-- Check if policies exist first
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view images from their own variant rows" ON variant_row_images;
  DROP POLICY IF EXISTS "Users can insert images to their own variant rows" ON variant_row_images;
  DROP POLICY IF EXISTS "Users can update images from their own variant rows" ON variant_row_images;
  DROP POLICY IF EXISTS "Users can delete images from their own variant rows" ON variant_row_images;
END $$;

CREATE POLICY "Users can view images from their own variant rows or admin" ON variant_row_images
  FOR SELECT
  USING (
    public.is_admin_user()
    OR
    EXISTS (
      SELECT 1 FROM variant_rows vr
      WHERE vr.id = variant_row_images.variant_row_id
      AND (
        -- If model_id is set, check model access
        (vr.model_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.models m 
          WHERE m.id = vr.model_id 
          AND (
            (m.team_id IS NULL AND m.owner_id = auth.uid()) 
            OR public.is_team_member(auth.uid(), m.team_id) 
            OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
          )
        ))
        OR
        -- If model_id is null, check user_id (backward compatibility)
        (vr.model_id IS NULL AND vr.user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can insert images to their own variant rows or admin" ON variant_row_images
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR
    EXISTS (
      SELECT 1 FROM variant_rows vr
      WHERE vr.id = variant_row_images.variant_row_id
      AND (
        -- If model_id is set, check model access
        (vr.model_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.models m 
          WHERE m.id = vr.model_id 
          AND (
            (m.team_id IS NULL AND m.owner_id = auth.uid()) 
            OR public.is_team_member(auth.uid(), m.team_id) 
            OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
          )
        ))
        OR
        -- If model_id is null, check user_id (backward compatibility)
        (vr.model_id IS NULL AND vr.user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can update images from their own variant rows or admin" ON variant_row_images
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR
    EXISTS (
      SELECT 1 FROM variant_rows vr
      WHERE vr.id = variant_row_images.variant_row_id
      AND (
        -- If model_id is set, check model access
        (vr.model_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.models m 
          WHERE m.id = vr.model_id 
          AND (
            (m.team_id IS NULL AND m.owner_id = auth.uid()) 
            OR public.is_team_member(auth.uid(), m.team_id) 
            OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
          )
        ))
        OR
        -- If model_id is null, check user_id (backward compatibility)
        (vr.model_id IS NULL AND vr.user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can delete images from their own variant rows or admin" ON variant_row_images
  FOR DELETE
  USING (
    public.is_admin_user()
    OR
    EXISTS (
      SELECT 1 FROM variant_rows vr
      WHERE vr.id = variant_row_images.variant_row_id
      AND (
        -- If model_id is set, check model access
        (vr.model_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.models m 
          WHERE m.id = vr.model_id 
          AND (
            (m.team_id IS NULL AND m.owner_id = auth.uid()) 
            OR public.is_team_member(auth.uid(), m.team_id) 
            OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
          )
        ))
        OR
        -- If model_id is null, check user_id (backward compatibility)
        (vr.model_id IS NULL AND vr.user_id = auth.uid())
      )
    )
  );

