-- Update generated_images RLS policies to check model access via model_id
-- This aligns generated_images RLS with variant_row_images policies
-- and allows team members to favorite images in the row tab

-- Drop existing policies
DROP POLICY IF EXISTS "read images if member" ON public.generated_images;
DROP POLICY IF EXISTS "read images if member or admin" ON public.generated_images;
DROP POLICY IF EXISTS "insert images if member" ON public.generated_images;
DROP POLICY IF EXISTS "insert images if member or admin" ON public.generated_images;
DROP POLICY IF EXISTS "update images if member" ON public.generated_images;
DROP POLICY IF EXISTS "update images if member or admin" ON public.generated_images;
DROP POLICY IF EXISTS "delete images if member" ON public.generated_images;
DROP POLICY IF EXISTS "delete images if member or admin" ON public.generated_images;

-- SELECT policy: Check model access OR user_id/team_id (backward compatibility)
CREATE POLICY "read images if member or admin" ON public.generated_images
  FOR SELECT USING (
    public.is_admin_user()
    OR
    -- Check model access via model_id
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = generated_images.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR
    -- Backward compatibility: check user_id/team_id directly
    (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id))
  );

-- INSERT policy: Check model access OR user_id/team_id (backward compatibility)
CREATE POLICY "insert images if member or admin" ON public.generated_images
  FOR INSERT WITH CHECK (
    public.is_admin_user()
    OR
    -- Check model access via model_id
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = generated_images.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR
    -- Backward compatibility: check user_id/team_id directly
    (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id))
  );

-- UPDATE policy: Check model access OR user_id/team_id (backward compatibility)
CREATE POLICY "update images if member or admin" ON public.generated_images
  FOR UPDATE USING (
    public.is_admin_user()
    OR
    -- Check model access via model_id
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = generated_images.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR
    -- Backward compatibility: check user_id/team_id directly
    (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id))
  );

-- DELETE policy: Check model access OR user_id/team_id (backward compatibility)
CREATE POLICY "delete images if member or admin" ON public.generated_images
  FOR DELETE USING (
    public.is_admin_user()
    OR
    -- Check model access via model_id
    EXISTS (
      SELECT 1 FROM public.models m 
      WHERE m.id = generated_images.model_id 
      AND (
        m.owner_id = auth.uid()
        OR (m.team_id IS NULL AND m.owner_id = auth.uid())
        OR public.is_team_member(auth.uid(), m.team_id) 
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())
      )
    )
    OR
    -- Backward compatibility: check user_id/team_id directly
    (user_id = auth.uid() OR public.is_team_member(auth.uid(), team_id))
  );

