# Variants Model Organization - Verification & Fix Guide

## Issue
Variants added via "Add to Variants" button are not appearing in the model's Variants tab.

## Root Cause
The migration `20251123000000_add_model_id_to_variant_rows.sql` needs to be run to add the `model_id` column to the `variant_rows` table.

## Steps to Fix

### 1. Run the Migration
Execute the migration file in your Supabase SQL Editor:
```bash
# File: ai-studio/supabase/migrations/20251123000000_add_model_id_to_variant_rows.sql
```

Or via Supabase CLI:
```bash
supabase db push
```

### 2. Verify Migration
Check that the column exists:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'variant_rows' AND column_name = 'model_id';
```

### 3. Check Existing Variants
If you have existing variants that were created before the migration, they will have `model_id = NULL`. These will appear in the "Orphaned Variants" section on the global `/variants` page.

### 4. Test the Flow
1. Go to a model page
2. Click "Add to Variants" on an image
3. Navigate to the "Variants" tab
4. The variant should appear there

## Debug Logging
The code now includes extensive debug logging. Check your browser console for:
- `[ModelPage] Fetched variant rows:` - Shows count and IDs
- `[BatchAdd] Successfully created variant row:` - Confirms model_id was set
- `[Variants] New variant row inserted via realtime` - Shows realtime updates

## Common Issues

### Issue: "model_id column does not exist" error
**Solution:** Run the migration file

### Issue: Variants appear in global page but not model tab
**Solution:** Check that variants have `model_id` set. Query:
```sql
SELECT id, model_id, name FROM variant_rows WHERE model_id IS NULL;
```

### Issue: RLS blocking access
**Solution:** Verify RLS policies were updated by the migration. Check:
```sql
SELECT * FROM pg_policies WHERE tablename = 'variant_rows';
```

## Files Changed
- `supabase/migrations/20251123000000_add_model_id_to_variant_rows.sql` - Migration
- `src/app/(protected)/models/[modelId]/page.tsx` - Fetches variants by model_id
- `src/components/model-tabs-content.tsx` - Tab navigation
- `src/components/model-variants-tab.tsx` - Variants tab content
- `src/components/variants/variants-rows-workspace.tsx` - Accepts modelId prop
- `src/app/api/variants/rows/batch-add/route.ts` - Sets model_id when creating variants
- `src/app/api/variants/rows/route.ts` - Supports model_id filtering

