# Reference Image Removal - Complete Implementation

## ✅ All Features Implemented and Fixed

### Problem Identified
When user clicked "Remove Default" button, the PATCH request was sent with `ref_image_urls: []`, but the backend logic wasn't respecting this. The issue was in how the system distinguished between:
- `ref_image_urls: null/undefined` → "Use model's default reference image"
- `ref_image_urls: []` → "User explicitly removed all references, use NO reference images"

### Root Cause
The backend logic used `row.ref_image_urls && row.ref_image_urls.length > 0` which treated both `null` and `[]` the same way, always falling back to the model's default reference image.

### Solution Implemented

#### 1. Backend API Changes

**File: `src/app/api/jobs/create/route.ts`**
- Changed logic to: `row.ref_image_urls !== null && row.ref_image_urls !== undefined`
- Now properly distinguishes between null (use default) and [] (no references)
- Allows successful job creation with target image only

**File: `src/app/api/prompt/generate/route.ts`**
- Applied same logic fix for AI prompt generation
- Supports both face-swap and target-only prompt generation

#### 2. Frontend Display Logic

**File: `src/components/model-workspace.tsx`**
- Updated reference image display to not show default when explicitly removed
- "Remove Default" button only appears when `ref_image_urls` is `null/undefined`
- Button disappears after removal (when `ref_image_urls` becomes `[]`)

#### 3. Complete Feature Set

**User can now:**
1. ✅ Use model's default reference image (when `ref_image_urls` is null)
2. ✅ Add custom reference images (populates `ref_image_urls` array)
3. ✅ Remove individual reference images (filters array)
4. ✅ Remove default reference image (sets `ref_image_urls: []`)
5. ✅ Generate with target image only (no reference images)
6. ✅ Re-add reference images after removal

**Three distinct states:**
- **null/undefined**: Use model default → Shows default image + "Remove Default" button
- **[] (empty array)**: No references → Shows no images, no remove button
- **[urls...]**: Custom references → Shows custom images + individual remove buttons

### Testing Scenarios

#### Test 1: Remove Default Reference Image
1. Row starts with no custom refs → Uses model default
2. Click "Remove Default" → Sends PATCH with `ref_image_urls: []`
3. Default image disappears, remove button disappears
4. Generate → Processes target image only (no face swap)

#### Test 2: Add and Remove Custom References
1. Click "Add Ref" → Upload custom reference images
2. Individual "Remove 1", "Remove 2" buttons appear
3. Click remove buttons → Removes specific images
4. When all removed → Falls back to empty array state
5. Generate → Processes target image only

#### Test 3: Add References After Removal
1. Start with default removed (`ref_image_urls: []`)
2. Click "Add Ref" → Upload new reference image
3. Custom reference appears, "Remove 1" button shows
4. Generate → Uses custom reference for face swap

### API Integration

**Job Creation Payload:**
```typescript
// With references (face swap)
{
  refPaths: ["refs/user-id/image1.jpg"],
  targetPath: "targets/user-id/target.jpg",
  prompt: "...",
  size: "4096*4096"
}

// Without references (target-only)
{
  refPaths: [],  // Empty array
  targetPath: "targets/user-id/target.jpg",
  prompt: "...",
  size: "4096*4096"
}
```

**WaveSpeed API Call:**
```typescript
// With references
images: [...refUrls, targetUrl]  // Multiple images

// Without references  
images: [targetUrl]  // Single image
```

### Database State Management

**Three distinct database states:**
1. **New row**: `ref_image_urls = null` → Uses model default
2. **Custom refs**: `ref_image_urls = ["path1", "path2"]` → Uses custom refs
3. **Removed all**: `ref_image_urls = []` → Uses no references

This explicit state management ensures the user's intent is preserved and correctly processed throughout the entire system.

## Files Modified

1. `/src/app/api/jobs/create/route.ts` - Job creation logic
2. `/src/app/api/prompt/generate/route.ts` - AI prompt generation
3. `/src/components/model-workspace.tsx` - UI display and buttons
4. `/src/app/api/dispatch/route.ts` - Already supported empty refPaths
5. `/src/lib/ai-prompt-generator.ts` - Already supported empty refUrls

All integration points now correctly handle the three states of reference images!
