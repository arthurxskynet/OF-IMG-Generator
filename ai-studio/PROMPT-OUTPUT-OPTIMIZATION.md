# Prompt Output Optimization - Seedream 4.0 Alignment

**Date:** November 21, 2025  
**Status:** ✅ COMPLETE  
**Issue:** Prompts contained irrelevant meta-instructions about image usage

---

## Problem Identified

### Before Optimization:
```
Use the first reference image for face structure and hair style. Use image 2 as the complete reference for body, clothing, pose, action, scene, environment, lighting, and atmosphere.

Subject details: The person is wearing...
Scene: Indoor setting with...
```

**Issues:**
1. ❌ Meta-instructions about "Use image 1 for..." (process, not result)
2. ❌ Confusing for Seedream (which already knows how to use references)
3. ❌ Wasted tokens on explaining the process instead of describing the result

### After Optimization:
```
Subject details: The person is wearing an elegant navy blue blazer with gold buttons, standing confidently with arms crossed...

Scene: Modern office setting with floor-to-ceiling windows, minimalist furniture visible in background...

Lighting: Warm afternoon natural lighting from the right creating gentle shadows...

Camera: Eye-level perspective with shallow depth of field, professional composition...

Atmosphere: Sophisticated professional mood with natural ambiance...

Colors and textures: Rich color palette dominated by blues and grays with metallic button accents, premium wool fabric texture...

Technical quality: High-resolution 8K image, sharp focus on the subject with professional photography style, fine details in fabric folds and accessory metals, realistic rendering without artifacts.
```

**Improvements:**
1. ✅ Describes the **final result** (what the image looks like)
2. ✅ No meta-instructions (just visual description)
3. ✅ Focused and relevant (only TARGET image details)
4. ✅ Clear source attribution (emphasizes TARGET for everything except face/hair)

---

## Changes Made

### 1. Face-Swap System Prompt
**Changed:**
- ❌ Removed: `[Reference instruction]: Use the first image for...`
- ✅ Added: `IGNORE Reference Image background, clothing, and pose`
- ✅ Added: Clear rules about what to ignore vs describe
- ✅ Added: `Do NOT include instructions about how to use images`

**Result:** LLM now describes the result image, not the process

### 2. Face-Swap User Prompt
**Changed:**
- ❌ Removed: `Reference roles: First image = face, Last image = body/clothes`
- ✅ Added: `SOURCE OF TRUTH` section with explicit attribution
- ✅ Added: `Do NOT include reference instructions` in output requirements

**Result:** Clearer instructions to focus on result description

### 3. Enhancement System Prompt
**Changed:**
- ❌ Removed: `Reference usage → Subject → Scene...` structure
- ✅ Changed to: `Subject → Scene → Lighting...` (no reference meta-section)
- ✅ Added: `Do NOT include meta-instructions about images`

**Result:** Enhanced prompts also describe results, not process

### 4. Enhancement User Prompt
**Changed:**
- ❌ Removed: `Reference → Subject → Scene...` output structure
- ✅ Changed to: `Subject → Scene → Lighting...` (clean structure)
- ✅ Added: `(no reference meta-instructions)` clarification

**Result:** Consistent result-focused output

### 5. Fallback Template
**Changed:**
- ❌ Removed: `Use the first reference image for...` preamble
- ✅ Changed to: Direct description of result
- ✅ Added: Mode-aware details (hair handling)

**Result:** Even fallback describes the result

### 6. Validation Logic
**Changed:**
- ❌ Removed: Check for "use.*reference.*image" (old requirement)
- ✅ Added: Check AGAINST meta-instructions (reverse validation)
- ✅ Added: Reject if prompt contains "use image for" patterns

**Result:** Validation enforces result-focused outputs

---

## Source Attribution Logic

### Face-Only Mode (`swapMode: 'face'`):
- ✅ **Face:** Handled by swap model (ignored in prompt)
- ✅ **Hair:** From TARGET image (describe it)
- ✅ **Body/Clothes/Pose/Scene:** From TARGET image (describe it)
- ❌ **Reference image:** IGNORE everything except identity

### Face+Hair Mode (`swapMode: 'face-hair'`):
- ✅ **Face:** Handled by swap model (ignored in prompt)
- ✅ **Hair:** From REFERENCE image (describe style, color, length)
- ✅ **Body/Clothes/Pose/Scene:** From TARGET image (describe it)
- ❌ **Reference image:** IGNORE background, clothes, pose

---

## Example Outputs

### Face-Only Mode Example:
```
Subject details: The person is wearing a tailored charcoal gray suit with silk lapels, standing in a relaxed pose with hands in pockets. Their natural dark brown shoulder-length hair frames the composition. Expression shows a confident, approachable demeanor.

Scene: Modern corporate office with glass walls, contemporary furniture, and city skyline visible through windows in the background.

Lighting: Professional studio-quality lighting with key light from the left creating dimensional shadows, soft fill light maintaining detail in shadow areas, warm color temperature (4500K).

Camera: Mid-range shot from slightly below eye-level, 85mm equivalent focal length, f/2.8 aperture creating soft background blur while keeping subject sharp.

Atmosphere: Professional yet approachable business environment, sophisticated and contemporary mood.

Colors and textures: Neutral gray and navy palette with warm skin tones, premium wool suit texture, smooth silk details, polished environment finishes.

Technical quality: High-resolution 8K image, sharp focus on the subject with professional photography style, fine details in fabric weave and texture, realistic skin rendering, clean image without artifacts.
```

### Face+Hair Mode Example:
```
Subject details: The person with flowing platinum blonde hair styled in loose waves is wearing an emerald green evening gown with intricate beading, standing gracefully with one hand on hip in an elegant pose.

Scene: Luxurious ballroom with crystal chandeliers, marble flooring, and ornate gold-framed mirrors reflecting ambient light.

Lighting: Dramatic evening lighting with warm overhead chandeliers creating golden highlights in the hair, soft rim lighting separating subject from background.

Camera: Full-length portrait shot from eye-level, medium telephoto perspective, f/1.4 aperture creating dreamy bokeh in background while maintaining sharp focus on subject.

Atmosphere: Glamorous evening event atmosphere, sophisticated and elegant mood with a touch of romance.

Colors and textures: Rich jewel-tone green as dominant color, metallic gold accents, platinum blonde hair creating bright contrast, smooth silk and sequined fabric textures.

Technical quality: High-resolution 8K image, sharp focus with professional photography style, fine details in beadwork and hair texture, realistic rendering with cinematic quality, no artifacts.
```

---

## Validation Rules

### Now REJECTS prompts with:
- "Use image 1 for..."
- "Use reference for..."
- "Image as reference..."
- Any meta-instructions about HOW to use images

### Now REQUIRES:
- Direct description of final result
- Subject details, Scene, Lighting, Camera, Atmosphere, Colors, Technical quality sections
- 80-800 words
- No markdown or meta-commentary

---

## Benefits

### 1. Cleaner Prompts
- No wasted tokens on process explanations
- Direct description of desired output
- Aligned with Seedream expectations

### 2. More Accurate Results
- Seedream gets clear visual description
- No confusion about reference handling
- Focus on what matters (the result)

### 3. Better Token Efficiency
- Removed ~30-50 tokens of meta-instructions
- More room for actual visual descriptions
- Better use of 1100 token budget

### 4. Seedream Alignment
- Matches official guide examples
- Natural language descriptions
- Result-focused (not process-focused)

---

## Testing Checklist

### ✅ Test Face-Only Mode:
- Verify hair is described from TARGET
- Verify no reference meta-instructions
- Verify clothes/pose/scene from TARGET

### ✅ Test Face+Hair Mode:
- Verify hair is described from REFERENCE  
- Verify no reference meta-instructions
- Verify clothes/pose/scene from TARGET

### ✅ Test Enhancement:
- Verify no reference meta-instructions
- Verify structure maintained
- Verify edits applied correctly

### ✅ Test Validation:
- Verify rejects prompts with "use image for"
- Verify accepts clean result descriptions
- Verify all section checks still work

---

## Status

✅ **All changes implemented**  
✅ **Build passes**  
✅ **No linter errors**  
✅ **Validation updated**  
✅ **Ready for testing**

**Next Step:** Test with real images to verify outputs match expectations

---

## Summary

Optimized prompt generation to focus on describing the **final result** instead of explaining the **process**. This makes prompts:
- Cleaner and more focused
- Better aligned with Seedream 4.0 expectations
- More token-efficient
- Easier for Seedream to interpret

All prompts now describe "what the image looks like" rather than "how to create the image".

