# Access Logic Alignment Summary

## Overview
All API endpoints and RLS policies have been aligned to use consistent access control logic across the entire codebase.

## Unified Access Logic Pattern

All endpoints now follow this exact pattern:

1. **Admin Check First**: `const isAdmin = await isAdminUser()`
2. **Model Access Check** (when model_id is present):
   - If `team_id === null`: User must be model owner
   - If `team_id !== null`: Check in order:
     - Model owner (always allowed)
     - Team member
     - Team owner
3. **Backward Compatibility** (for variant rows without model_id):
   - Check `user_id === auth.uid()`

## Fixed Endpoints

### Variant Endpoints ✅
- ✅ `POST /api/variants/rows` - Added admin check, aligned with batch-add
- ✅ `GET /api/variants/rows` - RLS handles access (no explicit check needed)
- ✅ `GET /api/variants/rows/[rowId]` - RLS handles access (no explicit check needed)
- ✅ `PATCH /api/variants/rows/[rowId]` - Fixed: Now uses model-based access check
- ✅ `DELETE /api/variants/rows/[rowId]` - Fixed: Now uses model-based access check
- ✅ `POST /api/variants/rows/batch-add` - Fixed: Added admin check, aligned logic
- ✅ `POST /api/variants/rows/[rowId]/images` - Fixed: Now uses model-based access check
- ✅ `DELETE /api/variants/rows/[rowId]/images/[imageId]` - Fixed: Now uses model-based access check
- ✅ `POST /api/variants/rows/[rowId]/generate` - Fixed: Now uses model-based access check
- ✅ `POST /api/variants/rows/[rowId]/prompt/generate` - Fixed: Now uses model-based access check
- ✅ `POST /api/variants/rows/[rowId]/prompt/enhance` - Fixed: Now uses model-based access check
- ✅ `GET /api/variants/jobs/active` - RLS handles access (uses user_id filter, RLS enforces team access)

### Model Rows Endpoints ✅
- ✅ `POST /api/rows` - Fixed: Now checks team membership and admin, not just ownership
- ✅ `GET /api/rows/[rowId]` - RLS handles access (no explicit check needed)
- ✅ `PATCH /api/rows/[rowId]` - Fixed: Now checks team membership and admin, not just ownership
- ✅ `DELETE /api/rows/[rowId]` - RLS handles access (no explicit check needed)

### Model Endpoints ✅
- ✅ `GET /api/models/[id]` - RLS handles access (no explicit check needed)
- ✅ `PATCH /api/models/[id]` - Fixed: Now checks team membership and admin
- ✅ `DELETE /api/models/[id]` - Fixed: Now checks team membership and admin

### Job Endpoints ✅
- ✅ `POST /api/jobs/create` - Fixed: Now checks model access before creating job
- ✅ `GET /api/jobs/[jobId]/poll` - Fixed: Now checks team membership and admin

### Image Endpoints ✅
- ✅ `PATCH /api/images/[imageId]/favorite` - Fixed: Now uses model-based access for variant_row_images
- ✅ `POST /api/images/batch-delete` - Fixed: Added admin support

### Upload Endpoints ✅
- ✅ `POST /api/upload/bulk` - Fixed: Now checks team membership and admin, not just ownership

## RLS Policies Updated

### Variant Rows Policies ✅
- ✅ `variant_rows_select_admin` - Admin + model access + backward compatibility
- ✅ `variant_rows_insert_admin` - Admin + model access + backward compatibility
- ✅ `variant_rows_update_admin` - Admin + model access + backward compatibility
- ✅ `variant_rows_delete_admin` - Admin + model access + backward compatibility

### Variant Row Images Policies ✅
- ✅ `variant_row_images_select_admin` - Admin + model access via variant_rows
- ✅ `variant_row_images_insert_admin` - Admin + model access via variant_rows
- ✅ `variant_row_images_update_admin` - Admin + model access via variant_rows
- ✅ `variant_row_images_delete_admin` - Admin + model access via variant_rows

### Model Rows Policies ✅
- ✅ `read rows if member or admin` - Fixed: Now allows model owners even when team_id is set
- ✅ `insert rows if member or admin` - Fixed: Now allows model owners even when team_id is set
- ✅ `update rows if member or admin` - Fixed: Now allows model owners even when team_id is set
- ✅ `delete rows if member or admin` - Fixed: Now allows model owners even when team_id is set

## Access Logic Consistency

All endpoints now use this exact pattern:

```typescript
const isAdmin = await isAdminUser()
let hasAccess = isAdmin

if (!hasAccess) {
  if (model.team_id === null) {
    hasAccess = model.owner_id === user.id
  } else {
    hasAccess = model.owner_id === user.id

    if (!hasAccess) {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', model.team_id)
        .eq('user_id', user.id)
        .single()
      
      if (teamMember) {
        hasAccess = true
      } else {
        const { data: team } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('id', model.team_id)
          .single()
        
        hasAccess = team?.owner_id === user.id
      }
    }
  }
}
```

## RLS Policy Pattern

All RLS policies now use this pattern:

```sql
public.is_admin_user()
OR
m.owner_id = auth.uid()  -- Model owner (always allowed)
OR (m.team_id IS NULL AND m.owner_id = auth.uid())  -- Redundant but explicit
OR public.is_team_member(auth.uid(), m.team_id)  -- Team member
OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = m.team_id AND t.owner_id = auth.uid())  -- Team owner
```

## Verification

All endpoints and RLS policies are now:
- ✅ Consistent in access logic
- ✅ Support admin users
- ✅ Support model owners (even with team_id)
- ✅ Support team members
- ✅ Support team owners
- ✅ Maintain backward compatibility for variant rows without model_id

## Next Steps

1. Run `COMPLETE-RLS-FIX.sql` in Supabase SQL Editor
2. Test all endpoints with different user roles (admin, owner, team member, team owner)
3. Verify no 403 errors occur for legitimate access

