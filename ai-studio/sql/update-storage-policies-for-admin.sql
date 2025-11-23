-- Update storage bucket RLS policies with admin support
-- Run this after the admin migration

-- First, drop all existing storage policies (both old and new names)
DROP POLICY IF EXISTS "allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "users_read_own_files_or_admin_read_all" ON storage.objects;
DROP POLICY IF EXISTS "users_upload_own_path_or_admin_upload_anywhere" ON storage.objects;
DROP POLICY IF EXISTS "users_update_own_files_or_admin_update_all" ON storage.objects;
DROP POLICY IF EXISTS "users_delete_own_files_or_admin_delete_all" ON storage.objects;

-- Ensure thumbnails bucket exists
INSERT INTO storage.buckets (id, name, public) VALUES
  ('thumbnails', 'thumbnails', false)
ON CONFLICT (id) DO NOTHING;

-- Helper function to extract user_id from storage path
-- Path format: {user_id}/filename.ext
-- Note: Created in public schema to avoid permission issues with storage schema
CREATE OR REPLACE FUNCTION public.get_user_id_from_storage_path(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' THEN
      (regexp_split_to_array(path, '/'))[1]::uuid
    ELSE
      NULL::uuid
  END;
$$;

-- ============================================
-- SELECT POLICIES (Read access)
-- ============================================
-- Users can read their own files OR admin can read all
CREATE POLICY "users_read_own_files_or_admin_read_all" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('outputs', 'refs', 'targets', 'thumbnails')
    AND (
      -- Admin can read all files
      public.is_admin_user()
      OR
      -- Users can read files in their own path
      (public.get_user_id_from_storage_path(name) = auth.uid())
    )
  );

-- ============================================
-- INSERT POLICIES (Upload access)
-- ============================================
-- Users can upload to their own path OR admin can upload anywhere
CREATE POLICY "users_upload_own_path_or_admin_upload_anywhere" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('outputs', 'refs', 'targets', 'thumbnails')
    AND (
      -- Admin can upload anywhere
      public.is_admin_user()
      OR
      -- Users can upload to their own path
      (public.get_user_id_from_storage_path(name) = auth.uid())
    )
  );

-- ============================================
-- UPDATE POLICIES (Modify access)
-- ============================================
-- Users can update their own files OR admin can update all
CREATE POLICY "users_update_own_files_or_admin_update_all" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('outputs', 'refs', 'targets', 'thumbnails')
    AND (
      -- Admin can update all files
      public.is_admin_user()
      OR
      -- Users can update files in their own path
      (public.get_user_id_from_storage_path(name) = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id IN ('outputs', 'refs', 'targets', 'thumbnails')
    AND (
      -- Admin can update all files
      public.is_admin_user()
      OR
      -- Users can update files in their own path
      (public.get_user_id_from_storage_path(name) = auth.uid())
    )
  );

-- ============================================
-- DELETE POLICIES (Delete access)
-- ============================================
-- Users can delete their own files OR admin can delete all
CREATE POLICY "users_delete_own_files_or_admin_delete_all" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('outputs', 'refs', 'targets', 'thumbnails')
    AND (
      -- Admin can delete all files
      public.is_admin_user()
      OR
      -- Users can delete files in their own path
      (public.get_user_id_from_storage_path(name) = auth.uid())
    )
  );

