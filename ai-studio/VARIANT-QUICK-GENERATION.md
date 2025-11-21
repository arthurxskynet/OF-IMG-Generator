# Variant Quick Generation - Direct Image Variation

**Date:** November 21, 2025  
**Status:** ✅ COMPLETE

---

## Overview

Added direct variant image generation that bypasses LLM prompt generation, using the image model directly to create random variations with slight changes. This provides a faster, simpler workflow for creating quick variants.

---

## Key Changes

### 1. **Separated Generation Methods** ✅

**Before:**
- Purple button → Generate text prompt with LLM
- Play button → Generate images from text prompt
- Two-step process required

**After:**
- Purple "Quick Variant" button → Generate image directly with random variation
- Text prompt enhancement → Separate flow for controlled generation
- One-click instant variants

---

## Quick Variant Button

### Location
Variants Rows Workspace - per row in the prompt column

### Behavior
1. User clicks "Quick Variant" (purple button with Sparkles icon)
2. System picks random variation instruction
3. Creates job directly with image model
4. Bypasses LLM/Grok prompt generation entirely
5. Generates image with slight random change

### Random Variations
The system randomly selects from 12 subtle changes:
- Slight change in lighting
- Subtle color variation
- Minor angle adjustment
- Different background blur
- Adjusted saturation
- Warmer color temperature
- Cooler color temperature
- Slightly different composition
- Enhanced contrast
- Softer lighting
- Subtle mood change
- Minor exposure adjustment

### Prompt Format
Simple instruction: `"Create a variant of the image with {random_variation}"`

---

## API Route

### Endpoint
`POST /api/variants/rows/[rowId]/generate-direct`

### Logic
```typescript
// 1. Get variant row images
// 2. Pick random variation from RANDOM_VARIATIONS array
// 3. Create simple prompt: "Create a variant with {variation}"
// 4. Create job in jobs table
// 5. Return jobId
```

### Example Job Payload
```json
{
  "refPaths": ["https://signed-url-1.jpg", "https://signed-url-2.jpg"],
  "targetPath": "",
  "prompt": "Create a variant of the image with subtle color variation",
  "width": 1024,
  "height": 1024
}
```

---

## Workflow Comparison

### Quick Variant (New)
```
Reference Images → [Quick Variant Button] → Image Generated
```
**Time:** ~10-30 seconds (direct generation)  
**Control:** Low (random variation)  
**Best for:** Fast exploration, multiple quick variations

### Controlled Generation (Existing)
```
Reference Images → Type/Enhance Prompt → [Generate Button] → Image Generated
```
**Time:** ~30-90 seconds (includes prompt setup)  
**Control:** High (precise instructions with presets)  
**Best for:** Specific desired outcomes, fine-tuned results

---

## UI Updates

### Button Changes
**Label:** "Quick Variant"  
**Icon:** Sparkles (purple)  
**Tooltip:** "Generate random variant image directly (no text prompt)"  

### Help Text
"Quick Variant: Random image variation • Or type/enhance prompt below for controlled generation"

### Disabled States
- No reference images
- Already generating

---

## Use Cases

### 1. **Rapid Exploration**
User wants to see 10 different variations quickly:
- Click "Quick Variant" 10 times on same row
- Each generates a different random variation
- Fast way to explore possibilities

### 2. **Inspiration**
User unsure what changes to make:
- Use "Quick Variant" to see random options
- Pick favorite variations
- Use those as basis for controlled generation

### 3. **A/B Testing**
User wants multiple versions for comparison:
- Generate several quick variants
- Compare side-by-side
- Choose best for further refinement

### 4. **Portfolio Diversity**
User needs variety without overthinking:
- Quick variants provide instant diversity
- Different lighting, colors, compositions
- Minimal effort required

---

## Technical Details

### File Created
`src/app/api/variants/rows/[rowId]/generate-direct/route.ts`

### File Modified
`src/components/variants/variants-rows-workspace.tsx`

### State Management
```typescript
const [generatingPromptRowId, setGeneratingPromptRowId] = useState<string | null>(null)

const handleGenerateVariant = async (rowId: string) => {
  setGeneratingPromptRowId(rowId)
  // ... generate direct variant
  setGeneratingPromptRowId(null)
}
```

### Error Handling
- Validates reference images exist
- Checks user authentication
- Handles job creation failures
- Provides clear error messages

---

## Logging

```javascript
console.log('[VariantGenerateDirect] Creating direct variant job', {
  rowId,
  refImagesCount: refUrls.length,
  variation: randomVariation  // e.g., "subtle color variation"
})
```

---

## Benefits

✅ **Speed** - Skip LLM prompt generation step  
✅ **Simplicity** - One-click operation  
✅ **Variety** - Random variations provide diversity  
✅ **Discovery** - Helps users explore options  
✅ **Cost-effective** - No LLM API calls  
✅ **Separate concerns** - Clear distinction between quick vs. controlled  

---

## Integration with Existing Features

### Works With
- ✅ Multi-image reference selection
- ✅ Job polling/status system
- ✅ Result display in Results column
- ✅ Image favoriting
- ✅ Thumbnail loading

### Does NOT Interfere With
- ✅ Text prompt enhancement (still available)
- ✅ Preset chips (for controlled generation)
- ✅ Manual prompt typing
- ✅ Prompt comparison feature

---

## Future Enhancements (Optional)

- [ ] Add "variation intensity" slider (subtle/moderate/strong)
- [ ] Allow user to pick specific variation type
- [ ] Show which variation was used for each result
- [ ] "Generate 5 quick variants" batch button
- [ ] Variation history/favorites

---

## Example Session

```
1. User adds 3 reference portrait images to row
2. Clicks "Quick Variant" → generates with "subtle color variation"
3. Result appears with slightly warmer tones
4. Clicks "Quick Variant" again → "softer lighting"
5. Result appears with gentler shadows
6. Clicks "Quick Variant" again → "minor angle adjustment"
7. Result appears with slight perspective shift
8. User now has 3 diverse variants in ~1 minute
```

---

## See Also

- `VARIANTS-SEEDREAM-V4-UPGRADE.md` - Controlled prompt generation
- `VARIANT-PRESET-ENHANCEMENTS.md` - Text prompt enhancement presets
- `src/app/api/variants/rows/[rowId]/generate/route.ts` - Controlled generation

---

**Status:** ✅ Production Ready  
**Generation Type:** Direct image-to-image with random variation  
**No LLM Required:** True  
**Speed:** Fast (one-click)

