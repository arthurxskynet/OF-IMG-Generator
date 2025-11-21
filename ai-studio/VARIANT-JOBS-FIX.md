# Variant Jobs Foreign Key Fix

**Date:** November 21, 2025  
**Status:** ✅ FIXED

---

## Problem

The `jobs` table had a foreign key constraint requiring `row_id` to reference `model_rows`, but variant jobs need to reference `variant_rows` instead. This caused errors:

```
insert or update on table "jobs" violates foreign key constraint "jobs_row_id_fkey"
Key is not present in table "model_rows".
```

---

## Solution

### 1. Database Migration

Created migration: `supabase/add-variant-jobs-support.sql`

**Changes:**
- Made `row_id` nullable (variant jobs don't have model_rows)
- Added `variant_row_id` column referencing `variant_rows`
- Added check constraint ensuring either `row_id` OR `variant_row_id` is set
- Added index on `variant_row_id` for performance

### 2. API Route Updates

**Updated Routes:**
- `src/app/api/variants/rows/[rowId]/generate-direct/route.ts`
- `src/app/api/variants/rows/[rowId]/generate/route.ts`

**Changes:**
- Set `row_id: null` for variant jobs
- Set `variant_row_id: rowId` for variant jobs
- Store `variantRowId` in `request_payload` for reference

### 3. Query Updates

**Updated:**
- `src/app/(protected)/variants/page.tsx`

**Changes:**
- Query jobs using `variant_row_id` instead of `row_id`
- Filter jobs by `variant_row_id` when attaching to variant rows

---

## Migration Instructions

### Run the Migration

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Using psql directly
psql -h your-db-host -U postgres -d your-db-name -f supabase/add-variant-jobs-support.sql

# Option 3: Via Supabase Dashboard
# Copy contents of add-variant-jobs-support.sql and run in SQL Editor
```

### Verify Migration

```sql
-- Check that variant_row_id column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'jobs' AND column_name = 'variant_row_id';

-- Check constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'jobs' AND constraint_name = 'jobs_row_or_variant_check';

-- Check index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'jobs' AND indexname = 'idx_jobs_variant_row';
```

---

## Schema Changes

### Before
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  row_id UUID NOT NULL REFERENCES model_rows(id),  -- Required, only for model_rows
  model_id UUID NOT NULL REFERENCES models(id),
  ...
);
```

### After
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  row_id UUID REFERENCES model_rows(id),           -- Nullable, for model_rows
  variant_row_id UUID REFERENCES variant_rows(id), -- New, for variant_rows
  model_id UUID NOT NULL REFERENCES models(id),
  ...
  CONSTRAINT jobs_row_or_variant_check CHECK (
    (row_id IS NOT NULL AND variant_row_id IS NULL) OR 
    (row_id IS NULL AND variant_row_id IS NOT NULL)
  )
);
```

---

## Job Creation Logic

### Model Rows (Existing)
```typescript
{
  row_id: modelRowId,      // References model_rows
  variant_row_id: null,    // Not used
  model_id: modelId,
  ...
}
```

### Variant Rows (New)
```typescript
{
  row_id: null,            // Not used for variants
  variant_row_id: variantRowId, // References variant_rows
  model_id: variantRowId,  // Placeholder (required field)
  request_payload: {
    ...
    variantRowId: variantRowId // Also stored in payload
  }
}
```

---

## Testing

### Test Quick Variant Generation
1. Add images to variant row
2. Click "Quick Variant" button
3. Should create job successfully
4. Check `jobs` table: `variant_row_id` should be set, `row_id` should be NULL

### Test Controlled Generation
1. Add images to variant row
2. Generate/enhance prompt
3. Click "Generate" button
4. Should create job successfully
5. Check `jobs` table: `variant_row_id` should be set, `row_id` should be NULL

### Verify Jobs Appear
1. Go to variants page
2. Jobs should appear in Results column
3. Generated images should display correctly

---

## Rollback (If Needed)

If you need to rollback:

```sql
-- Remove constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_row_or_variant_check;

-- Remove variant_row_id column
ALTER TABLE public.jobs DROP COLUMN IF EXISTS variant_row_id;

-- Make row_id NOT NULL again
ALTER TABLE public.jobs ALTER COLUMN row_id SET NOT NULL;

-- Drop index
DROP INDEX IF EXISTS idx_jobs_variant_row;
```

---

## Files Modified

1. ✅ `supabase/add-variant-jobs-support.sql` - Migration file
2. ✅ `src/app/api/variants/rows/[rowId]/generate-direct/route.ts` - Direct generation
3. ✅ `src/app/api/variants/rows/[rowId]/generate/route.ts` - Controlled generation
4. ✅ `src/app/(protected)/variants/page.tsx` - Job querying

---

## Status

✅ **Migration Created**  
✅ **API Routes Updated**  
✅ **Query Logic Updated**  
⏳ **Migration Needs to be Run** (user action required)

---

**Next Steps:**
1. Run the migration SQL file
2. Test variant generation
3. Verify jobs appear correctly

