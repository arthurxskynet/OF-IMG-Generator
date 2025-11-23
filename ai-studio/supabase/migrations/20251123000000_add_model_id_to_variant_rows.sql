-- Add model_id column to variant_rows table
-- This allows variants to be organized by model

-- Step 1: Add model_id column (nullable for backward compatibility)
ALTER TABLE variant_rows
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE CASCADE;

-- Step 2: Create index for model_id
CREATE INDEX IF NOT EXISTS idx_variant_rows_model_id ON variant_rows(model_id);

-- Step 3: Drop existing RLS policies (they will be recreated with model access checks)
DROP POLICY IF EXISTS "Users can view their own variant rows" ON variant_rows;
DROP POLICY IF EXISTS "Users can insert their own variant rows" ON variant_rows;
DROP POLICY IF EXISTS "Users can update their own variant rows" ON variant_rows;
DROP POLICY IF EXISTS "Users can delete their own variant rows" ON variant_rows;

-- Step 4: Create new RLS policies that check model access when model_id is set,
-- or fall back to user_id check when model_id is null (for orphaned variants)
CREATE POLICY "Users can view their own variant rows or model variants"
  ON variant_rows
  FOR SELECT
  USING (
    -- If model_id is set, check model access (similar to model_rows)
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

CREATE POLICY "Users can insert their own variant rows or model variants"
  ON variant_rows
  FOR INSERT
  WITH CHECK (
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

CREATE POLICY "Users can update their own variant rows or model variants"
  ON variant_rows
  FOR UPDATE
  USING (
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

CREATE POLICY "Users can delete their own variant rows or model variants"
  ON variant_rows
  FOR DELETE
  USING (
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

