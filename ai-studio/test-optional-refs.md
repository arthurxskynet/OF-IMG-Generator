# Optional Reference Images - Test Plan

## Implementation Summary
Successfully implemented optional reference images functionality. Users can now remove all reference images from a row and process only the target image for image-to-image edits without face swap.

## Key Changes Made

### 1. Job Creation API (`src/app/api/jobs/create/route.ts`)
- ✅ Removed validation requiring `refPaths.length > 0`
- ✅ Now only validates that `targetPath` exists
- ✅ Allows empty `refPaths` array

### 2. Dispatch API (`src/app/api/dispatch/route.ts`)
- ✅ Modified URL signing to handle empty `refPaths`
- ✅ Updated image array construction: `allImages = refUrls.length > 0 ? [...refUrls, targetUrl] : [targetUrl]`
- ✅ Added operation type logging: 'face-swap' vs 'target-only'

### 3. Frontend Model Workspace (`src/components/model-workspace.tsx`)
- ✅ Updated `hasValidImages()` to only require target image
- ✅ Modified `handleGenerate()` to only validate target image
- ✅ Updated `handleAiPromptGeneration()` to only require target image
- ✅ Fixed Generate button disabled logic to only check target image

### 4. AI Prompt Generation API (`src/app/api/prompt/generate/route.ts`)
- ✅ Removed reference image requirement validation
- ✅ Updated URL signing to handle empty reference images
- ✅ Added operation type logging

### 5. AI Prompt Generator (`src/lib/ai-prompt-generator.ts`)
- ✅ Added `generateTargetOnlyPrompt()` function for target-only processing
- ✅ Modified main function to handle empty `refUrls` array
- ✅ Created separate prompt generation logic for image enhancement vs face swap

## Test Scenarios

### Scenario 1: Face Swap (Reference + Target)
1. Create a row with reference images and target image
2. Generate AI prompt - should work with face swap prompts
3. Generate image - should send both reference and target to WaveSpeed
4. Verify operation type logged as 'face-swap'

### Scenario 2: Target Only (No Reference)
1. Create a row with only target image (no reference images)
2. Generate AI prompt - should work with enhancement prompts
3. Generate image - should send only target to WaveSpeed
4. Verify operation type logged as 'target-only'

### Scenario 3: Remove All References
1. Start with a row that has reference images
2. Remove all reference images using "Clear All" button
3. Generate AI prompt - should work with enhancement prompts
4. Generate image - should send only target to WaveSpeed

## Expected Behavior
- ✅ Existing face swap functionality remains unchanged
- ✅ Target-only processing works with WaveSpeed API
- ✅ AI prompt generation adapts to available images
- ✅ UI validation only requires target image
- ✅ No breaking changes to existing workflows

## Database Impact
- ✅ No schema changes needed (ref_image_urls already nullable)
- ✅ Existing data remains compatible
- ✅ Type definitions already support optional reference images
