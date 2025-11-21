# Seedream v4 API Reality Check

**Date:** November 21, 2025  
**Issue:** Prompt format mismatch with Seedream v4 API expectations

---

## Current Implementation

### What we're generating (300-400 words):
```
Subject details: The person is wearing an elegant navy blue blazer with gold buttons, standing confidently with arms crossed in a modern office setting.

Scene: Modern office setting with floor-to-ceiling windows, minimalist furniture visible in background.

Lighting: Warm afternoon natural lighting from the right creating gentle shadows.

Camera: Eye-level perspective with shallow depth of field, professional composition.

Atmosphere: Sophisticated professional mood with natural ambiance.

Colors and textures: Rich color palette dominated by blues and grays with metallic button accents, premium wool fabric texture.

Technical quality: High-resolution 8K image, sharp focus on the subject with professional photography style, fine details in fabric folds and accessory metals, realistic rendering without artifacts.
```

**Length:** ~150-400 words  
**Format:** Structured sections  
**Purpose:** Comprehensive scene description

---

## What Seedream v4 Actually Expects

### From API Documentation & Examples:

#### Face Swap:
```
Replace the face of the person in the image with a smiling young woman with short blonde hair.
```

#### Hair Swap:
```
Change the hairstyle of the person in the image to long, curly red hair.
```

#### Face Swap with Reference:
```
Replace the subject's face with the face from Image 1, maintaining the original lighting and expression.
```

**Length:** 10-30 words  
**Format:** Single sentence, action-oriented  
**Purpose:** Describe the edit operation

---

## The Problem

### ❌ We're treating Seedream like DALL-E/Midjourney
- Those models need comprehensive prompts to **generate** images from scratch
- They benefit from detailed descriptions of every element
- More detail = better generation quality

### ✅ Seedream is an EDITING model
- It already has the base image (target)
- It already has the reference image(s)
- It just needs to know **what edit to perform**
- Excessive detail is **irrelevant and confusing**

---

## Architecture Flow

```
[Reference Images] + [Target Image] + [Prompt] → Seedream API → [Edited Image]
     ↑                   ↑                ↑
   Face/Hair         Body/Scene      Edit instruction
```

### What Seedream v4 Sees:
1. **Reference Image(s)**: Contains the face/hair to transfer
2. **Target Image**: Contains the body, pose, scene, lighting, etc.
3. **Prompt**: Instruction on what to do

### What Seedream v4 Needs from Prompt:
- **Clear edit operation**: "Replace face", "Swap hair", "Transfer face and hair"
- **Optional constraints**: "maintaining original lighting", "keeping the expression"
- **Optional attribute descriptions**: Hair style from reference, if needed

### What Seedream v4 Does NOT Need:
- ❌ Description of target image scene (it can see it!)
- ❌ Description of lighting setup (it can see it!)
- ❌ Description of clothing/pose (it can see it!)
- ❌ Camera settings, atmosphere, colors (it can see all of this!)
- ❌ Technical quality instructions (it always does high quality!)

---

## The Reality

### Images speak louder than words for Seedream!

When you pass:
```
images: [reference1.jpg, target.jpg]
```

Seedream can SEE:
- ✅ The target person's clothes, pose, body language
- ✅ The scene, background, environment
- ✅ The lighting, shadows, time of day
- ✅ The camera angle, composition
- ✅ The colors, textures, materials
- ✅ The technical quality of the original

### What it CAN'T determine from images alone:
- ❓ Which face/hair to use (needs reference image order + prompt)
- ❓ Whether to swap face only or face+hair (needs prompt)
- ❓ Any specific constraints or modifications (needs prompt)

---

## Recommended Fix

### Face-Only Swap:
```
Replace the face in the target image with the face from the reference image, keeping the original hair, body, clothing, pose, scene, and lighting unchanged.
```

**Length:** ~25 words  
**Clear:** Specifies face-only  
**Concise:** No redundant scene description

### Face+Hair Swap:
```
Replace the face and hair in the target image with the face and hairstyle from the reference image, keeping the original body, clothing, pose, scene, and lighting unchanged.
```

**Length:** ~30 words  
**Clear:** Specifies face+hair  
**Concise:** No redundant scene description

### Multiple Reference Images (Face+Hair):
```
Transfer the face from reference image 1 and the hairstyle from reference image 2 onto the target image, preserving the original body, clothing, pose, scene, and lighting.
```

**Length:** ~30 words  
**Clear:** Specifies which reference for what  
**Concise:** No redundant scene description

---

## Why Our Current Approach is Problematic

### 1. **Wasted Tokens**
- We're using 300-400 words to describe things Seedream can already see
- This wastes API costs and processing time
- Most of the prompt is irrelevant to the task

### 2. **Potential Confusion**
- Detailed descriptions might conflict with what Seedream sees in the image
- "warm afternoon lighting" in prompt vs. harsh studio lighting in actual image → confusion
- Seedream might try to reconcile the differences, causing artifacts

### 3. **Over-Engineering**
- We built a comprehensive prompt system for a simple editing API
- The LLM (Grok) is analyzing images in detail to describe what Seedream can already see
- This adds latency, cost, and complexity for no benefit

### 4. **Not Aligned with API Design**
- Seedream v4 is designed for image editing, not generation
- The API expects concise editing instructions
- Our prompts are designed for image generation models

---

## What We Should Keep from Current System

### ✅ Using Grok Vision to analyze images
- Still valuable for understanding swap mode requirements
- Can identify edge cases (no face visible, multiple people, etc.)
- Can validate reference/target compatibility

### ✅ Safety checks
- NEVER describe facial features, skin tone, ethnicity
- These are still critical for responsible AI

### ✅ Swap mode handling
- Face-only vs. face+hair is important
- Grok can help determine which mode is appropriate

---

## Proposed New Approach

### Option 1: Simple Template (No LLM needed)
```typescript
function generateSeedreamPrompt(swapMode: 'face' | 'face-hair'): string {
  if (swapMode === 'face') {
    return 'Replace the face in the target image with the face from the reference image, keeping the original hair, body, clothing, pose, scene, and lighting unchanged.'
  } else {
    return 'Replace the face and hair in the target image with the face and hairstyle from the reference image, keeping the original body, clothing, pose, scene, and lighting unchanged.'
  }
}
```

**Pros:**
- ✅ Simple, fast, no API calls
- ✅ Consistent results
- ✅ Aligned with Seedream expectations
- ✅ No token costs

**Cons:**
- ❌ Not adaptive to specific images
- ❌ No edge case handling

### Option 2: LLM-Enhanced (Current approach, simplified)
```typescript
// Use Grok to analyze images and generate a concise editing instruction
// Focus on:
// 1. Confirm swap operation is appropriate
// 2. Identify any special constraints
// 3. Generate 1-2 sentence editing instruction
// 4. NO scene description (Seedream can see it)
```

**Pros:**
- ✅ Adaptive to specific images
- ✅ Can handle edge cases
- ✅ Can add relevant constraints
- ✅ Still aligned with Seedream

**Cons:**
- ❌ More complex
- ❌ API costs for Grok
- ❌ Added latency

---

## Decision Required

Which approach should we use?

### Recommendation: **Option 1 (Simple Template)**

**Reasoning:**
1. Seedream v4 is designed to work with minimal prompts
2. The images contain all the visual information
3. Simple, reliable, fast, cost-effective
4. Aligned with API design philosophy

### If you need LLM analysis, use it for:
- **Validation**: Is swap appropriate? Are faces visible?
- **Edge cases**: Multiple people, no clear face, etc.
- **Compatibility**: Do reference and target match?
- **NOT for**: Describing scenes Seedream can already see

---

## Action Items

1. ✅ Verify Seedream v4 API documentation for official prompt guidelines
2. ⚠️ Test current long prompts vs. short prompts for quality comparison
3. ⚠️ Decide on simple template vs. LLM-enhanced approach
4. ⚠️ Refactor prompt generation logic
5. ⚠️ Update validation rules
6. ⚠️ Test with real images

---

## Conclusion

**Current state:** Over-engineered prompts (300-400 words) describing everything Seedream can already see

**Reality:** Seedream v4 is an editing API that needs concise instructions (10-30 words)

**Recommendation:** Simplify to action-oriented prompts: "Replace the face with the reference face, keep everything else unchanged"

**Benefit:** Faster, cheaper, more aligned with API design, better results

