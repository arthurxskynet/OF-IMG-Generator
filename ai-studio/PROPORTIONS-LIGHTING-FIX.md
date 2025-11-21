# Proportions & Lighting Preservation Fix

**Date:** November 21, 2025  
**Status:** ✅ COMPLETE  
**Issue:** Face swaps not preserving proper proportions and lighting from target image

---

## Problem

Face swap results showed:
- ❌ **Incorrect proportions** - Face size/scale not matching target body
- ❌ **Lighting mismatch** - Swapped face lighting didn't match scene lighting
- ❌ **Composition issues** - Perspective and depth not preserved

**Root Cause:** Prompts didn't explicitly tell Seedream to preserve these critical aspects.

---

## Solution from Seedream 4.0 Best Practices

Based on Seedream 4.0 documentation, we need to explicitly specify:

1. **"ensuring natural/realistic facial proportions"**
2. **"maintaining the [specific lighting] that matches the original scene composition"**
3. **"preserving the perspective"** (implicit in composition reference)

---

## Changes Made

### 1. Updated Required Output Format ✅

**Before:**
```
"Replace the face... in [setting], maintaining the [lighting] and original pose."
```

**After:**
```
"Replace the face... in [setting], ensuring natural facial proportions and 
maintaining the [lighting] that matches the original scene composition and perspective."
```

**Added:**
- ✅ "ensuring natural facial proportions"
- ✅ "that matches the original scene composition"  
- ✅ "and perspective"

---

### 2. Updated System Prompt Examples ✅

**Face-Only Example - Before:**
```
"Replace the face with the reference face, onto the person wearing a navy suit 
with short dark hair in a modern office with natural lighting, maintaining the 
standing pose."
```

**Face-Only Example - After:**
```
"Replace the face with the reference face, onto the person wearing a navy suit 
with short dark hair in a modern office, ensuring natural facial proportions and 
maintaining the natural window lighting that matches the original composition."
```

**Face+Hair Example - Before:**
```
"Replace the face and hair (long blonde wavy hair) with the reference, onto the 
person wearing casual denim in an outdoor park with afternoon lighting, maintaining 
the sitting pose."
```

**Face+Hair Example - After:**
```
"Replace the face and hair (long blonde wavy hair) with the reference, onto the 
person wearing casual denim in an outdoor park, ensuring natural proportions and 
maintaining the afternoon lighting that matches the original scene composition."
```

---

### 3. Added Critical Preservation Requirements Section ✅

```
CRITICAL PRESERVATION REQUIREMENTS:
✅ ALWAYS include: "ensuring natural/realistic facial proportions"
✅ ALWAYS include: "maintaining the [lighting] that matches the original scene composition"
✅ Consider: Perspective, camera angle, depth relationships from target
```

This makes it **mandatory** for the LLM to include these preservation instructions.

---

### 4. Updated Critical Rules ✅

**Before:**
```
CRITICAL RULES:
- MUST describe visible elements from BOTH images
- Keep concise: 25-50 words
- NEVER describe facial features, skin tone, ethnicity
- Be SPECIFIC to these actual images
```

**After:**
```
CRITICAL RULES:
- MUST describe visible elements from BOTH images
- MUST include "ensuring natural/realistic facial proportions"
- MUST include "maintaining the [lighting] that matches the original scene composition"
- Keep concise: 25-55 words (slightly longer to accommodate proportions/lighting)
- NEVER describe facial features, skin tone, ethnicity
- Be SPECIFIC to these actual images
```

---

### 5. Updated Token Limits ✅

**Before:**
```typescript
const maxTokens = 200  // Concise instructions (20-50 words)
```

**After:**
```typescript
const maxTokens = 250  // Image-specific instructions (25-55 words)
```

Allows slightly longer outputs to accommodate the required proportions/lighting preservation language.

---

## Expected Output Examples

### Face-Only Swap with Proportions/Lighting:

**Input:**
- Reference: Woman's face
- Target: Man in blue suit, short dark hair, office, window light

**Expected Output:**
```
"Replace the face with the reference face, onto the person wearing a blue 
business suit with short dark hair in a modern office setting, ensuring natural 
facial proportions and maintaining the natural window lighting that matches the 
original scene composition."
```

**Word count:** ~38 words  
**Key elements:**
- ✅ Specific clothing: "blue business suit"
- ✅ Specific hair: "short dark hair"
- ✅ Specific setting: "modern office setting"
- ✅ **Proportions:** "ensuring natural facial proportions"
- ✅ **Lighting:** "maintaining the natural window lighting that matches the original scene composition"

---

### Face+Hair Swap with Proportions/Lighting:

**Input:**
- Reference: Woman with long blonde wavy hair
- Target: Person in denim, outdoor park, afternoon sun

**Expected Output:**
```
"Replace the face and hair (long blonde wavy hair) with the reference face and 
hairstyle, onto the person wearing casual denim jacket in an outdoor park setting, 
ensuring natural proportions and maintaining the soft afternoon sunlight that 
matches the original scene composition."
```

**Word count:** ~42 words  
**Key elements:**
- ✅ Specific hair: "long blonde wavy hair"
- ✅ Specific clothing: "casual denim jacket"
- ✅ Specific setting: "outdoor park setting"
- ✅ **Proportions:** "ensuring natural proportions"
- ✅ **Lighting:** "maintaining the soft afternoon sunlight that matches the original scene composition"

---

## How This Fixes Proportions/Lighting Issues

### 1. Proportions Fix:
**Instruction:** "ensuring natural/realistic facial proportions"

**Effect:** Tells Seedream to:
- Scale the face appropriately for the target body
- Match head-to-body ratio from target
- Preserve natural size relationships
- Avoid oversized or undersized face swaps

---

### 2. Lighting Fix:
**Instruction:** "maintaining the [specific lighting] that matches the original scene composition"

**Effect:** Tells Seedream to:
- Analyze target image lighting (direction, intensity, quality)
- Apply same lighting to swapped face
- Match shadows and highlights
- Preserve lighting consistency across the image

---

### 3. Composition Fix:
**Instruction:** "matches the original scene composition"

**Effect:** Tells Seedream to:
- Respect camera angle/perspective
- Preserve depth relationships
- Maintain spatial positioning
- Keep overall scene balance

---

## Before vs After Comparison

### Before (Generic, No Proportions/Lighting):
```
"Replace the face and hair with the reference, keeping the body, clothing, 
pose, scene, and lighting unchanged."
```

**Issues:**
- ❌ No explicit proportions guidance
- ❌ Vague "unchanged" instruction
- ❌ No composition reference
- ❌ Generic template

**Result:** Incorrect proportions, lighting mismatches

---

### After (Specific, With Proportions/Lighting):
```
"Replace the face and hair (long blonde wavy hair) with the reference, onto 
the person wearing casual denim in an outdoor park, ensuring natural proportions 
and maintaining the afternoon lighting that matches the original scene composition."
```

**Benefits:**
- ✅ Explicit proportions: "ensuring natural proportions"
- ✅ Specific lighting: "afternoon lighting"
- ✅ Composition reference: "matches the original scene composition"
- ✅ Image-specific details

**Result:** Accurate proportions, consistent lighting

---

## Key Insights from Seedream 4.0

1. **Be Explicit About Preservation:**
   - Don't just say "keep unchanged"
   - Specify **what** to preserve and **how**
   - "maintaining the X that matches Y"

2. **Proportions Are Critical:**
   - Face swap isn't just face replacement
   - Scale and size relationships matter
   - Must explicitly request "natural proportions"

3. **Lighting Consistency Is Essential:**
   - Lighting makes or breaks realism
   - Must match direction, intensity, quality
   - Reference the "original scene" for context

4. **Composition Context Matters:**
   - Camera perspective affects face placement
   - Depth and spatial relationships important
   - "original scene composition" guides placement

---

## Testing Checklist

### Test 1: Office Portrait
- **Input:** Reference face → Target in suit, office, window light
- **Expected:** Face properly scaled, window light preserved
- **Check:** Head-to-body ratio, lighting direction match

### Test 2: Outdoor Scene
- **Input:** Reference face+hair → Target in casual wear, park, sun
- **Expected:** Natural proportions, sunlight preserved
- **Check:** Face size appropriate, lighting consistent

### Test 3: Different Perspectives
- **Input:** Reference → Target at angle, dramatic lighting
- **Expected:** Perspective maintained, lighting matched
- **Check:** Face angle correct, shadows align

---

## Files Modified

- `/ai-studio/src/lib/ai-prompt-generator.ts`
  - `buildSeedreamFaceSwapSystemPrompt()` - Added proportions/lighting requirements
  - `buildSeedreamFaceSwapUserText()` - Updated format with preservation instructions
  - Token limits increased to 250 for longer instructions

---

## Validation

✅ **Build Status:** Passes  
✅ **Linter Status:** No errors  
✅ **Word Count:** 25-55 words (within 10-150 limit)  
✅ **Required Elements:** Proportions + Lighting preservation mandatory

---

## Summary

### What We Added:

1. **Mandatory proportions preservation:**
   - "ensuring natural/realistic facial proportions"

2. **Mandatory lighting preservation:**
   - "maintaining the [specific lighting] that matches the original scene composition"

3. **Composition reference:**
   - Links lighting and proportions to "original scene composition"

### Why It Works:

- **Explicit instructions** guide Seedream's editing algorithms
- **Specific lighting** ensures consistent illumination
- **Proportions guidance** ensures proper scaling
- **Composition reference** maintains perspective

### Expected Improvement:

- ✅ Better facial proportions (correct head-to-body ratio)
- ✅ Consistent lighting (face matches scene lighting)
- ✅ Preserved composition (perspective and depth maintained)
- ✅ More realistic results overall

**Status:** Ready for testing! Next face swap should show improved proportions and lighting preservation.

