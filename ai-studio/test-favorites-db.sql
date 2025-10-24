-- Test script to verify favorites functionality
-- Run this in your Supabase SQL editor

-- 1. Check if the is_favorited column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'generated_images' 
AND column_name = 'is_favorited';

-- 2. Check the structure of generated_images table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'generated_images'
ORDER BY ordinal_position;

-- 3. Check if there are any generated_images records
SELECT COUNT(*) as total_images FROM generated_images;

-- 4. Check a few sample records with is_favorited field
SELECT id, is_favorited, user_id, created_at
FROM generated_images 
LIMIT 5;

-- 5. Test updating a record (replace 'your-image-id' with an actual image ID)
-- UPDATE generated_images 
-- SET is_favorited = true 
-- WHERE id = 'your-image-id' 
-- RETURNING id, is_favorited;
