-- Add admin support to variant_rows and variant_row_images RLS policies
-- This migration ensures admins can access all variant rows and images

-- ============================================
-- VARIANT ROWS POLICIES
-- ============================================
-- Drop all possible policy names (including truncated ones)
DROP POLICY IF EXISTS "Users can view their own variant rows or model variants" ON variant_rows;
DROP POLICY IF EXISTS "Users can view their own variant rows or model variants or admi" ON variant_rows;
DROP POLICY IF EXISTS "variant_rows_select_admin" ON variant_rows;
CREATE POLICY "variant_rows_select_admin" ON variant_rows
  FOR SELECT
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own variant rows or model variants" ON variant_rows;
DROP POLICY IF EXISTS "Users can insert their own variant rows or model variants or admi" ON variant_rows;
DROP POLICY IF EXISTS "variant_rows_insert_admin" ON variant_rows;
CREATE POLICY "variant_rows_insert_admin" ON variant_rows
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own variant rows or model variants" ON variant_rows;
DROP POLICY IF EXISTS "Users can update their own variant rows or model variants or admi" ON variant_rows;
DROP POLICY IF EXISTS "variant_rows_update_admin" ON variant_rows;
CREATE POLICY "variant_rows_update_admin" ON variant_rows
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    ))
    OR
    -- If model_id is null, check user_id (backward compatibility)
    (model_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their own variant rows or model variants" ON variant_rows;
DROP POLICY IF EXISTS "Users can delete their own variant rows or model variants or admi" ON variant_rows;
DROP POLICY IF EXISTS "variant_rows_delete_admin" ON variant_rows;
CREATE POLICY "variant_rows_delete_admin" ON variant_rows
  FOR DELETE
  USING (
    public.is_admin_user()
    OR
    -- If model_id is set, check model access
    (model_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = variant_rows.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
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
-- Drop all possible policy names (including truncated ones)
DROP POLICY IF EXISTS "Users can view images from their own variant rows" ON variant_row_images;
DROP POLICY IF EXISTS "Users can insert images to their own variant rows" ON variant_row_images;
DROP POLICY IF EXISTS "Users can update images from their own variant rows" ON variant_row_images;
DROP POLICY IF EXISTS "Users can delete images from their own variant rows" ON variant_row_images;
DROP POLICY IF EXISTS "Users can view images from their own variant rows or admi" ON variant_row_images;
DROP POLICY IF EXISTS "Users can insert images to their own variant rows or admi" ON variant_row_images;
DROP POLICY IF EXISTS "Users can update images from their own variant rows or admi" ON variant_row_images;
DROP POLICY IF EXISTS "Users can delete images from their own variant rows or admi" ON variant_row_images;
DROP POLICY IF EXISTS "variant_row_images_select_admin" ON variant_row_images;
DROP POLICY IF EXISTS "variant_row_images_insert_admin" ON variant_row_images;
DROP POLICY IF EXISTS "variant_row_images_update_admin" ON variant_row_images;
DROP POLICY IF EXISTS "variant_row_images_delete_admin" ON variant_row_images;

CREATE POLICY "variant_row_images_select_admin" ON variant_row_images
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
            m.owner_id = auth.uid()
            OR (m.team_id IS NULL AND m.owner_id = auth.uid())
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

CREATE POLICY "variant_row_images_insert_admin" ON variant_row_images
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
            m.owner_id = auth.uid()
            OR (m.team_id IS NULL AND m.owner_id = auth.uid())
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

CREATE POLICY "variant_row_images_update_admin" ON variant_row_images
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
            m.owner_id = auth.uid()
            OR (m.team_id IS NULL AND m.owner_id = auth.uid())
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

CREATE POLICY "variant_row_images_delete_admin" ON variant_row_images
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
            m.owner_id = auth.uid()
            OR (m.team_id IS NULL AND m.owner_id = auth.uid())
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

