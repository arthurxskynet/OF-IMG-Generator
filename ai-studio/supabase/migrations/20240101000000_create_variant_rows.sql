-- Create variant_rows table
CREATE TABLE IF NOT EXISTS variant_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  team_id UUID NOT NULL,
  name TEXT,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create variant_row_images table
CREATE TABLE IF NOT EXISTS variant_row_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_row_id UUID NOT NULL REFERENCES variant_rows(id) ON DELETE CASCADE,
  output_path TEXT NOT NULL,
  thumbnail_path TEXT,
  source_row_id UUID,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_variant_rows_user_id ON variant_rows(user_id);
CREATE INDEX IF NOT EXISTS idx_variant_rows_team_id ON variant_rows(team_id);
CREATE INDEX IF NOT EXISTS idx_variant_rows_created_at ON variant_rows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_variant_row_images_variant_row_id ON variant_row_images(variant_row_id);
CREATE INDEX IF NOT EXISTS idx_variant_row_images_position ON variant_row_images(variant_row_id, position);

-- Enable RLS
ALTER TABLE variant_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_row_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for variant_rows
-- Users can only access their own rows
CREATE POLICY "Users can view their own variant rows"
  ON variant_rows
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own variant rows"
  ON variant_rows
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own variant rows"
  ON variant_rows
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own variant rows"
  ON variant_rows
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for variant_row_images
-- Users can only access images from their own variant rows
CREATE POLICY "Users can view images from their own variant rows"
  ON variant_row_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM variant_rows
      WHERE variant_rows.id = variant_row_images.variant_row_id
      AND variant_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert images to their own variant rows"
  ON variant_row_images
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variant_rows
      WHERE variant_rows.id = variant_row_images.variant_row_id
      AND variant_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update images from their own variant rows"
  ON variant_row_images
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM variant_rows
      WHERE variant_rows.id = variant_row_images.variant_row_id
      AND variant_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete images from their own variant rows"
  ON variant_row_images
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM variant_rows
      WHERE variant_rows.id = variant_row_images.variant_row_id
      AND variant_rows.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_variant_rows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_variant_rows_updated_at_trigger
  BEFORE UPDATE ON variant_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_variant_rows_updated_at();

