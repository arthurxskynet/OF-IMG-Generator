-- Add admin support to AI Studio
-- This migration adds is_admin column and helper function

-- Add is_admin column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Create helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, anon;

-- Update existing profiles to ensure is_admin is false (safety)
UPDATE public.profiles SET is_admin = false WHERE is_admin IS NULL;

