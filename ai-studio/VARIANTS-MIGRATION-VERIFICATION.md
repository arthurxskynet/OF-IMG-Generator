# Variants Model Organization - Complete Migration Verification

## Migration Status Checklist

### ✅ Database Migration
- [x] Migration file created: `20251123000000_add_model_id_to_variant_rows.sql`
- [ ] **ACTION REQUIRED**: Run migration in Supabase SQL Editor
- [ ] Verify `model_id` column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'variant_rows' AND column_name = 'model_id';`

### ✅ API Updates
- [x] POST `/api/variants/rows` - Accepts `model_id`, validates model access
- [x] GET `/api/variants/rows` - Supports `model_id` query param filter
- [x] GET `/api/variants/rows/[rowId]` - Includes model data in response
- [x] POST `/api/variants/rows/batch-add` - Accepts `model_id`, sets it on new rows

### ✅ UI Components
- [x] Model page has tabs: "Rows" and "Variants"
- [x] Variants tab shows only that model's variants
- [x] Global variants page groups variants by model
- [x] "Add Row" button includes `model_id` when on model page
- [x] "Add to Variants" includes `model_id` from model workspace

### ✅ Realtime Updates
- [x] Realtime subscription for `variant_rows` INSERT events
- [x] Filters by `model_id` when on model page
- [x] Updates UI automatically without manual refresh
- [x] Tab badge count updates dynamically

## Complete Flow Verification

### Flow 1: Add Variant from Model Workspace
1. User on model page → Rows tab
2. Click "Add to Variants" on image
3. API call: `POST /api/variants/rows/batch-add` with `model_id: model.id`
4. Variant row created with `model_id` set
5. Realtime subscription detects INSERT
6. Variants tab automatically updates (if open)
7. Tab badge count updates

### Flow 2: Add Empty Row in Model Variants Tab
1. User on model page → Variants tab
2. Click "Add Row" button
3. API call: `POST /api/variants/rows` with `model_id: modelId`
4. Variant row created with `model_id` set
5. Realtime subscription detects INSERT
6. Row appears immediately in list
7. Tab badge count updates

### Flow 3: Global Variants Page
1. User navigates to `/variants`
2. Page fetches all variants (grouped by model)
3. Shows variants in cards grouped by model
4. "View in Model" link navigates to model's variants tab
5. Orphaned variants (no model_id) shown in separate section

## Testing Steps

1. **Run Migration First**
   ```sql
   -- Run: ai-studio/supabase/migrations/20251123000000_add_model_id_to_variant_rows.sql
   ```

2. **Test Model Variants Tab**
   - Go to a model page
   - Click "Variants" tab
   - Click "Add Row" → Should create row with model_id
   - Go to "Rows" tab
   - Click "Add to Variants" on an image
   - Go back to "Variants" tab → Should see new variant (no refresh needed)

3. **Test Global Variants Page**
   - Go to `/variants`
   - Should see variants grouped by model
   - Each group should have "View in Model" link
   - Click link → Should navigate to model's variants tab

4. **Verify Realtime Updates**
   - Open model page → Variants tab
   - In another tab, add a variant via "Add to Variants"
   - First tab should update automatically (check console for realtime logs)

## Known Issues & Solutions

### Issue: "No variant rows yet" on Variants tab
**Cause**: Migration not run OR variants created without model_id
**Solution**: 
1. Run migration
2. Check browser console for errors
3. Verify variants have model_id: `SELECT id, model_id FROM variant_rows WHERE model_id IS NULL;`

### Issue: Variants not updating automatically
**Cause**: Realtime subscription not working
**Solution**:
1. Check browser console for `[Variants] New variant row inserted via realtime` logs
2. Verify Supabase realtime is enabled
3. Check network tab for WebSocket connections

### Issue: Global page shows all variants in one group
**Cause**: Grouping logic not working
**Solution**: Check that variants have `model_id` set and grouping code is executing

## Files Modified

### Database
- `supabase/migrations/20251123000000_add_model_id_to_variant_rows.sql`

### API Routes
- `src/app/api/variants/rows/route.ts`
- `src/app/api/variants/rows/[rowId]/route.ts`
- `src/app/api/variants/rows/batch-add/route.ts`

### Pages
- `src/app/(protected)/models/[modelId]/page.tsx`
- `src/app/(protected)/variants/page.tsx`

### Components
- `src/components/model-tabs-content.tsx`
- `src/components/model-variants-tab.tsx`
- `src/components/variants/variants-rows-workspace.tsx`
- `src/components/model-workspace.tsx`
- `src/components/ui/tabs.tsx` (new)

### Types
- `src/types/variants.ts`

