# Variants LLM → Seedream v4 Upgrade

**Date:** November 21, 2025  
**Status:** ✅ COMPLETE

---

## Overview

Upgraded the Variants feature to produce Seedream v4-ready prompts with adaptive sampling, comprehensive multi-section outputs, and enhanced UI controls. The system now generates rich, detailed variant prompts optimized for image generation quality.

---

## Key Improvements

### 1. **Seedream v4 Rich Templates** ✅

Created comprehensive template builders for variant generation and enhancement:

- `buildSeedreamVariantSystemPrompt(imagesCount)` - Rich system prompt with Seedream v4 principles
- `buildSeedreamVariantUserText(imagesCount)` - Detailed user instructions for analysis
- `buildSeedreamVariantEnhanceSystemPrompt()` - Enhancement system prompt
- `buildSeedreamVariantEnhanceUserText(existingPrompt, userInstructions)` - Enhancement user instructions

**Output Structure:**
- Subject & Style (type, quality, approach)
- Composition & Framing (camera angles, depth of field)
- Lighting Setup (sources, quality, mood)
- Color Palette & Atmosphere (colors, tone, emotion)
- Environment & Setting (location, background, space)
- Technical Quality (sharpness, resolution, markers)
- Variation Guidelines (what to preserve vs. vary)

**Word Count:** 150-400 words (vs. 25-60 legacy)

---

### 2. **Adaptive Sampling Parameters** ✅

Intelligent temperature and token adjustments based on context:

```typescript
buildAdaptiveSamplingParams({
  scenario: 'variant-generate' | 'variant-enhance',
  imagesCount: number,
  instructionComplexity: 'low' | 'medium' | 'high'
})
```

**Temperature Logic:**
- Baseline: 0.5
- Single image: 0.45 (-0.05)
- 3 images: 0.55 (+0.05)
- 5+ images: 0.6 (+0.1)
- Simple enhancement: -0.05
- Complex enhancement: +0.05
- Clamped: 0.35-0.65

**Max Tokens:**
- Base: 600 for rich variants
- Scales up with more images (max 600)

**Benefits:**
- Better multi-image synthesis with more references
- More consistent output with single images
- Adaptive complexity matching

---

### 3. **Unified Validation** ✅

New `validateSeedreamVariantPrompt()` function:

**Checks:**
- ✓ No meta-commentary or markdown
- ✓ Word count 50-500 (rich format)
- ✓ Contains Seedream section indicators
- ✓ Has variant/generation language
- ✓ No forbidden facial/ethnic descriptors
- ✓ No unsafe content

**Legacy validator preserved** for backward compatibility when flag is disabled.

---

### 4. **Enhanced API Logging** ✅

All variant API routes now log:
- Prompt style (seedream-v4-rich vs. legacy-concise)
- Image count
- Word count
- Adaptive parameters used
- Use rich prompts flag status

**Routes Updated:**
- `/api/variants/prompt/generate`
- `/api/variants/prompt/enhance`
- `/api/variants/rows/[rowId]/prompt/generate`
- `/api/variants/rows/[rowId]/prompt/enhance`

---

### 5. **UI Quick Controls** ✅

#### Preset Enhancement Chips
Quick-access buttons for common enhancements:
- 🎭 Dramatic lighting
- 🌅 Golden hour
- 🎬 Professional studio
- 🎨 Muted palette
- 🌈 Vibrant colors
- 📷 Shallow DOF

#### Compare View
- Toggle to show original vs. generated prompt
- Saves original automatically on generation
- Side-by-side comparison

#### Seedream v4 Ready Badge
- Green checkmark when prompt ≥50 words
- Shows word count
- Visual confirmation of quality

**Components Updated:**
- `variants-rows-workspace.tsx` - Per-row controls
- `variants-workspace.tsx` - Simple workspace badge
- `variant-prompt-enhance-dialog.tsx` - Preset chips in dialog

---

### 6. **Integration Tests** ✅

Created `test-variant-prompts.js`:

**Validates:**
- ✅ No meta-commentary or markdown
- ✅ Word count in range (50-500)
- ✅ Contains Seedream v4 sections
- ✅ Has variant language
- ✅ No forbidden descriptors
- ✅ No unsafe content

**Run:**
```bash
node test-variant-prompts.js
```

---

## Environment Variable

### `PROMPT_VARIANTS_RICH`

**Default:** `true` (enabled)

```bash
# Enable rich Seedream v4 variant prompts (DEFAULT)
PROMPT_VARIANTS_RICH=true

# Use legacy concise variant prompts
PROMPT_VARIANTS_RICH=false
```

**Documentation:** See `ENVIRONMENT-VARIABLES.md` for full details.

---

## Files Modified

### Core Library
- `src/lib/ai-prompt-generator.ts` - Templates, adaptive sampling, validation

### API Routes
- `src/app/api/variants/prompt/generate/route.ts`
- `src/app/api/variants/prompt/enhance/route.ts`
- `src/app/api/variants/rows/[rowId]/prompt/generate/route.ts`
- `src/app/api/variants/rows/[rowId]/prompt/enhance/route.ts`

### UI Components
- `src/components/variants/variants-rows-workspace.tsx`
- `src/components/variants/variants-workspace.tsx`
- `src/components/variants/variant-prompt-enhance-dialog.tsx`

### Documentation
- `ENVIRONMENT-VARIABLES.md` - Added PROMPT_VARIANTS_RICH docs

### Tests
- `test-variant-prompts.js` - New integration tests

---

## Usage Example

### Generate Rich Variant Prompt

```typescript
// User adds 3 images to variant row
// Clicks "Generate Prompt" button

// System:
// 1. Calculates adaptive params:
//    - temperature: 0.55 (base 0.5 + 0.05 for 3 images)
//    - maxTokens: 600
//    - scenario: 'variant-generate'
//
// 2. Uses Seedream v4 rich templates
// 3. Generates comprehensive 200-word prompt
// 4. Validates with validateSeedreamVariantPrompt()
// 5. Saves to variant_rows.prompt
// 6. Shows "✓ Seedream v4 ready (200 words)" badge
```

### Enhance with Preset

```typescript
// User clicks "Dramatic lighting" preset chip
// Instructions auto-fill: "Make lighting more dramatic with high contrast"
// Clicks enhance button

// System:
// 1. Calculates adaptive params:
//    - temperature: 0.45 (base 0.5 - 0.05 for low complexity)
//    - maxTokens: 600
//    - instructionComplexity: 'low'
//
// 2. Uses Seedream v4 enhancement templates
// 3. Modifies Lighting Setup section
// 4. Preserves other sections
// 5. Returns enhanced 220-word prompt
```

---

## Rollout Strategy

### Phase 1: Staging (Recommended)
1. Deploy with `PROMPT_VARIANTS_RICH=true`
2. Test variant generation with 1, 3, 5+ images
3. Test enhancement with presets
4. Verify word counts (150-400)
5. Check for any validation errors in logs

### Phase 2: Production
1. Enable in production
2. Monitor logs for `promptStyle: 'seedream-v4-rich'`
3. Track generation success rate
4. Collect user feedback

### Rollback
If issues occur:
```bash
PROMPT_VARIANTS_RICH=false
```
Reverts to legacy 25-60 word concise prompts.

---

## Success Metrics

✅ **All Implementation Goals Met:**
- ✓ Rich Seedream v4 templates active
- ✓ Adaptive sampling operational
- ✓ Validation unified and working
- ✓ API logging enhanced
- ✓ UI controls added (presets, compare, badge)
- ✓ Integration tests passing
- ✓ Environment flag documented

**Output Quality:**
- 150-400 word comprehensive prompts
- Multi-section structure
- Seedream v4 compliant
- Adaptive to context

**User Experience:**
- Quick preset chips
- Compare view for validation
- Seedream-ready badge
- Smooth workflow

---

## See Also

- `SEEDREAM-4.0-INTEGRATION-SUMMARY.md` - Original Seedream v4 integration
- `ENVIRONMENT-VARIABLES.md` - Full env var documentation
- `test-variant-prompts.js` - Integration test suite
- `src/lib/ai-prompt-generator.ts` - Core implementation

---

**Status:** ✅ Production Ready

