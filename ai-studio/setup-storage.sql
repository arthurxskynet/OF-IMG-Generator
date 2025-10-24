-- Storage setup for AI Studio
-- Run this in your Supabase SQL Editor after the main database setup

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('refs', 'refs', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('targets', 'targets', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('outputs', 'outputs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "allow authenticated uploads" ON storage.objects;
CREATE POLICY "allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "allow authenticated reads" ON storage.objects;
CREATE POLICY "allow authenticated reads" ON storage.objects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow authenticated updates" ON storage.objects;
CREATE POLICY "allow authenticated updates" ON storage.objects
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "allow authenticated deletes" ON storage.objects;
CREATE POLICY "allow authenticated deletes" ON storage.objects
  FOR DELETE TO authenticated USING (true);

