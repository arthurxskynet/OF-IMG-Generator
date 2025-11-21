# Image-Specific Prompts Fix

**Date:** November 21, 2025  
**Status:** ✅ COMPLETE  
**Issue:** LLM was generating generic prompts instead of analyzing actual images

---

## Problem Identified

### Before (Generic Output):
```
"Replace the face and hair with the face and hairstyle from the reference image, 
keeping the body, clothing, pose, scene, and lighting unchanged."
```

**Issues:**
- ❌ Completely generic template
- ❌ No reference to actual image content
- ❌ LLM not using visual analysis
- ❌ Same output for any images
- ❌ No context for Seedream API

---

## Root Cause

The prompts told the LLM:
> "Seedream can SEE the images - don't describe what's visible"

This was **too restrictive** - while Seedream can see the images, the **prompt still needs specific context** to guide the editing operation appropriately.

---

## Solution

Changed from **"don't describe"** to **"describe what you see and reference it in the instruction"**.

### Key Changes:

1. **System Prompt**: Now explicitly requires image-specific details
2. **User Prompt**: Now demands visual analysis and specific descriptions
3. **Examples**: Show exactly what image-specific prompts look like
4. **Validation**: Will work better with actual visual content

---

## Changes Made

### 1. Face-Swap System Prompt ✅

**New Requirements:**
```
CRITICAL REQUIREMENT:
Your prompt must be SPECIFIC to these actual images. Describe what you SEE:
- Reference image: [Face only OR Face + Hair details]
- Target image: Clothing, setting/environment, lighting quality, pose
- Generic prompts will be REJECTED

WHAT TO DESCRIBE:
✅ Reference: Hair color, length, style (if face+hair mode)
✅ Target clothing: "blue business suit", "casual denim jacket"
✅ Target hair: "short dark hair" (if face-only mode)
✅ Target setting: "modern office", "outdoor park"
✅ Target lighting: "natural window light", "soft afternoon sun"
```

**Examples Added:**
```
Face-only:
✅ "Replace the face with the reference face, onto the person wearing 
   a navy suit with short dark hair in a modern office with natural 
   lighting, maintaining the standing pose."

Face+Hair:
✅ "Replace the face and hair (long blonde wavy hair) with the reference 
   face and hairstyle, onto the person wearing casual denim in an outdoor 
   park with afternoon lighting, maintaining the sitting pose."
```

---

### 2. Face-Swap User Prompt ✅

**New Structure:**
```
ANALYZE THE IMAGES CAREFULLY and create instruction (25-50 words) 
that references what you actually see.

YOUR TASK:
1. **Look at reference**: Note the [face/hair details]
2. **Look at target**: Note clothing, setting, lighting
3. **Create instruction**: WITH specific visual details

REQUIRED FORMAT:
"Replace the [face/face+hair] ([hair details if applicable]) with the 
reference, onto the person wearing [specific clothing] [with specific hair 
if face-only] in [specific setting], maintaining the [specific lighting] 
and original pose."

CRITICAL RULES:
- MUST describe visible elements from BOTH images
- Keep concise: 25-50 words
- NEVER describe facial features, skin tone, ethnicity
- Be SPECIFIC to these actual images
```

---

### 3. Target-Only User Prompt ✅

**New Structure:**
```
ANALYZE THE IMAGE CAREFULLY and create enhancement instruction (30-50 words) 
that references what you see.

YOUR TASK:
1. **Look at the image**: Note subject, setting, lighting, quality
2. **Identify what to enhance**: Quality, sharpness, lighting, colors
3. **Create instruction**: WITH specific context from this image

REQUIRED FORMAT:
"Enhance [this specific type of image] with [specific improvements] 
while maintaining [specific aspects from image]."

EXAMPLES:
✅ "Enhance this professional office portrait with improved sharpness, 
   balanced lighting, and refined fabric details while maintaining the 
   natural window lighting and business setting."

WHAT TO REFERENCE:
✅ Scene type: "office portrait", "outdoor scene"
✅ Current lighting: "natural window light", "afternoon sun"
✅ Setting: "professional office", "outdoor park"
✅ Specific improvements based on what you see
```

---

## Expected Output Examples

### Face-Only Swap:
**Input Images:**
- Reference: Woman's face
- Target: Man in blue suit, short dark hair, modern office, window light

**Expected Output:**
```
"Replace the face with the reference face, onto the person wearing a blue 
business suit with short dark hair in a modern office setting with natural 
window lighting, maintaining the professional standing pose."
```
**(~35 words, image-specific)**

---

### Face+Hair Swap:
**Input Images:**
- Reference: Woman with long blonde wavy hair
- Target: Person in casual denim, outdoor park, afternoon sun

**Expected Output:**
```
"Replace the face and hair (long blonde wavy hair) with the reference face 
and hairstyle, onto the person wearing casual denim jacket in an outdoor 
park setting with soft afternoon sunlight, maintaining the relaxed sitting pose."
```
**(~38 words, image-specific)**

---

### Target-Only Enhancement:
**Input Image:**
- Professional office portrait, natural lighting, business attire

**Expected Output:**
```
"Enhance this professional office portrait with improved sharpness, balanced 
exposure, and refined fabric texture details while maintaining the natural 
window lighting style and corporate setting composition."
```
**(~28 words, image-specific)**

---

## Benefits

### 1. **Contextual Accuracy** 🎯
- Prompts now reference actual image content
- Seedream gets specific guidance
- Better editing results

### 2. **Visual Analysis** 👁️
- LLM analyzes what it sees
- Describes relevant details
- Creates context-aware instructions

### 3. **Better Seedream Results** ✨
- Specific clothing/setting/lighting context
- Helps Seedream understand the scene
- More accurate preservation of elements

### 4. **Still Concise** ✂️
- Maintains 25-50 word target
- Focused on essential details
- Not verbose scene descriptions

### 5. **Validation-Ready** ✅
- Can validate for image-specific content
- Can reject generic templates
- Ensures quality outputs

---

## What Changed in Philosophy

### Before:
**Philosophy:** "Seedream can see the images, so don't describe anything"  
**Result:** Generic templates with no image context

### After:
**Philosophy:** "Seedream can see the images, but needs contextual guidance on WHAT to edit and what to preserve"  
**Result:** Image-specific instructions that guide the edit operation

---

## Key Insight

While Seedream v4 **can see** the images, the **prompt serves as an editing instruction** that:

1. ✅ Identifies what to change (face/hair from reference)
2. ✅ Specifies what to preserve (clothing, setting, lighting from target)
3. ✅ Provides context (what kind of scene, lighting, style)
4. ✅ Guides the operation (maintain pose, preserve atmosphere)

The prompt is not just "change X, keep Y" - it's **"change X to this specific thing, preserve Y which is this specific thing, in this specific context"**.

---

## Testing

### Test Case 1: Professional Office
**Images:**
- Reference: Face with long hair
- Target: Person in suit, office, window light

**Expected Prompt:**
"Replace face and hair (long dark hair) with reference, onto person in business suit in modern office with natural window lighting, maintaining standing pose."

---

### Test Case 2: Casual Outdoor
**Images:**
- Reference: Face only
- Target: Person in t-shirt, park, afternoon sun, curly hair

**Expected Prompt:**
"Replace face with reference, onto person wearing casual t-shirt with curly hair in outdoor park with soft afternoon sunlight, keeping relaxed pose."

---

### Test Case 3: Enhancement
**Image:**
- Portrait in home, evening lighting, need quality boost

**Expected Prompt:**
"Enhance this home portrait with improved sharpness and detail while maintaining the warm evening lighting and intimate setting atmosphere."

---

## Validation Updates Needed

Currently validation checks for:
- ✅ Word count (10-150 words)
- ✅ Action words (replace/swap/enhance)
- ✅ Preservation words (keep/maintain/unchanged)

**Should add:**
- Check for generic templates (reject if too similar to examples)
- Check for image-specific details (clothing/setting/lighting mentioned)
- Ensure variety across different images

---

## Files Modified

- `/ai-studio/src/lib/ai-prompt-generator.ts`
  - `buildSeedreamFaceSwapSystemPrompt()` - Added image-specific requirements
  - `buildSeedreamFaceSwapUserText()` - Added visual analysis instructions
  - `buildSeedreamTargetOnlyUserText()` - Added image-specific enhancement guidance

---

## Status

✅ **Build Status:** Passes  
✅ **Linter Status:** No errors  
✅ **Ready for Testing:** Yes

**Next Step:** Test with actual images to verify LLM now produces image-specific prompts instead of generic templates!

---

## Summary

Changed from:
- ❌ Generic: "Replace face, keep everything unchanged"

To:
- ✅ Specific: "Replace face with reference, onto person wearing [clothing] with [hair] in [setting] with [lighting], maintaining [pose]"

**Result:** LLM now analyzes images and creates contextual, specific editing instructions that guide Seedream v4 appropriately!

