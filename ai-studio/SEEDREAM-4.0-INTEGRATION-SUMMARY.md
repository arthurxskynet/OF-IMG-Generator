# Seedream 4.0 Integration - Implementation Summary

**Date:** November 21, 2025  
**Source:** https://www.seedream4.net/prompt-guide  
**Scope:** Complete integration of Seedream 4.0 official prompting guide into Grok LLM prompt generation

## Overview

Successfully integrated Seedream 4.0 official prompting guide principles into all Grok LLM prompt generation flows. All prompts now follow production-ready Seedream 4.0 standards for optimal image generation quality.

## Seedream 4.0 Key Principles Applied

Based on the official guide at https://www.seedream4.net/prompt-guide, we integrated:

### 1. **Natural Language Structure**
- Combine: subject + action + environment
- Add concise: style, color, lighting, composition keywords
- Example: "A girl in elegant clothing, holding a parasol, walking down a tree-lined avenue, Monet oil painting style"

### 2. **Specificity Over Abstraction**
- Use concrete, detailed language
- Replace vague terms: "crimson velvet evening gown" NOT "nice dress"
- Describe only clearly visible elements

### 3. **Reference Image Roles**
- Clearly specify what each reference provides
- Preserve characters, products, style through references
- Multi-reference: specify roles (character from Image 1, background from Image 2, style from Image 3)

### 4. **Editing Formula**
- Structure: Action + Object + Attribute
- Examples: "Change knight's helmet to gold", "Replace lighting with warm golden hour"

### 5. **Context Definition**
- Specify: style + context + purpose
- Guide accurate output with clear intent

### 6. **Visible Elements Only**
- Describe what is actually visible in images
- No speculation or invention
- Focus on relevant scene-contributing details

## Implementation Details

### Files Modified

**Primary File:** `ai-studio/src/lib/ai-prompt-generator.ts`

### Changes Made

#### 1. **Face-Swap Prompts** ✅
- **System Prompt**: Restructured to emphasize Seedream 4.0 principles
  - Clear reference role specification
  - Natural language flow requirements
  - Specificity requirements with examples
  - Safety constraints (no facial features, skin tone, ethnicity)
  
- **User Prompt**: Updated to reinforce guide principles
  - Be specific and detailed
  - Natural language flow
  - Reference roles clear
  - Only visible elements

- **Parameters Optimized**:
  - `max_tokens`: 1100 (higher for complex multi-image analysis)
  - `temperature`: 0.5 (balanced for detailed descriptions)
  - `frequency_penalty`: 0.3 (encourage varied vocabulary)
  - `presence_penalty`: 0.2 (slight repetition penalty)

#### 2. **Target-Only Enhancement** ✅
- **System Prompt**: Production-ready enhancement structure
  - Natural language + specificity emphasis
  - Context definition for quality enhancement
  - Only visible elements
  - Technical photography terms for lighting/camera

- **User Prompt**: Concrete language requirements
  - Specific examples ("navy blue blazer with gold buttons" not "nice jacket")
  - Natural flow
  - Context definition

- **Parameters Optimized**:
  - `max_tokens`: 1000
  - `temperature`: 0.45 (balance creativity and consistency)

#### 3. **Prompt Enhancement** ✅
- **System Prompt**: Seedream 4.0 refinement principles
  - Editing formula: Action + Object + Attribute
  - Enhance specificity over abstraction
  - Context strengthening
  - Remove speculation, keep visible elements

- **User Prompt**: Action-based editing
  - Apply Seedream editing formula
  - Natural language flow
  - Concrete detail enhancement

- **Parameters Optimized**:
  - `max_tokens`: 1100 (comprehensive enhanced prompts)
  - `temperature`: 0.55 (slightly higher for creative enhancements)

#### 4. **Removed Legacy Code Paths** ✅
- Set `USE_RICH_PROMPTS = true` (always enabled)
- Removed all conditional legacy/concise prompt builders
- All flows now use Seedream 4.0 structured prompts
- Validation always uses `validateSeedreamPrompt()`

#### 5. **Enhanced Fallback Template** ✅
- Replaced simple one-line fallback with structured Seedream 4.0 template
- Maintains production quality even when all LLM models fail
- Includes all required sections: Reference → Subject → Scene → Lighting → Camera → Atmosphere → Colors → Quality

#### 6. **Model-Specific Parameter Tuning** ✅
- Newer models (grok-4-fast-reasoning, grok-4, grok-3-mini): no frequency/presence penalties
- Older models (grok-2-vision-1212): penalties applied
- Token limits increased for rich prompts (1000-1100)
- Temperature tuned per scenario (0.45-0.55)

## Seedream 4.0 Output Structure

All prompts now follow this standardized structure:

```
[Reference instruction]: Role of each reference image

[Subject details]: Clothing (specific visible details), pose (exact body position), action/body language

[Scene]: Location type, environment elements, spatial relationships

[Lighting]: Light source, direction, quality, shadows, color temperature

[Camera]: Angle, perspective, depth of field, composition, framing

[Atmosphere]: Mood, ambiance, weather effects, emotional tone

[Colors and textures]: Dominant palette, materials, surface properties, color harmony

[Technical quality]: Resolution, focus, professional photography quality
```

## Safety Constraints Maintained

All prompts enforce:
- **Never describe**: Facial features, skin tone, ethnicity
- **Face-only mode**: Additionally never describe hair (color, style, length, texture)
- **Reference terms**: Use "this person", "the subject" for individuals
- **Visible only**: No speculation or invented details
- **Relevance**: Omit minor irrelevant background elements

## Benefits

1. **Production Quality**: All prompts follow Seedream 4.0 official guide standards
2. **Consistency**: Uniform structure across all generation types
3. **Optimal Results**: Natural language + specificity = better image generation
4. **Clear Context**: Reference roles and editing formulas explicitly stated
5. **Safety**: Maintained all safety constraints while enhancing quality
6. **Fallback Robustness**: Even fallback prompts are structured and production-ready

## Testing Recommendations

### Manual Testing Flows

1. **Face-Swap Flow**
   - Test with `swapMode: 'face'` (face only, preserve hair)
   - Test with `swapMode: 'face-hair'` (face and hair)
   - Verify reference roles are clearly stated
   - Check output includes all sections
   - Confirm no facial feature descriptions

2. **Target-Only Flow**
   - Upload single target image (no references)
   - Verify enhancement prompt has all sections
   - Check natural language flow
   - Confirm specificity (concrete descriptions)

3. **Enhancement Flow**
   - Start with existing prompt
   - Apply user instructions (e.g., "change lighting to sunset", "add dramatic shadows")
   - Verify editing formula applied (Action + Object + Attribute)
   - Check structure preserved
   - Confirm safety constraints maintained

### Expected Log Output

All console logs now show:
- `promptStyle: 'seedream-4.0'`
- Appropriate `maxTokens` per scenario
- `temperature` optimized per flow
- Validation with `validateSeedreamPrompt()`

### Validation Checks

Prompts are validated for:
- ✅ No markdown or meta-commentary
- ✅ Word count 80-800 words
- ✅ Required sections present (Subject, Scene, Lighting, Camera)
- ✅ Reference usage statement (for face-swap)
- ✅ No forbidden descriptors (facial features, skin tone, ethnicity, hair in face-only mode)
- ✅ No unsafe content

## Environment Variables

No new environment variables required. Existing variables:
- `XAI_API_KEY`: Required for Grok API access
- `PROMPT_USE_LLM_FACESWAP`: Optional (default: true) - enables LLM prompt generation
- ~~`PROMPT_USE_RICH_STYLE`~~: Deprecated - always uses Seedream 4.0 now

## Rollback Plan

If needed, revert commit to restore previous implementation with:
- Legacy concise mode option
- Simpler prompt templates
- Lower token limits

## Related Documentation

- **Seedream 4.0 Official Guide**: https://www.seedream4.net/prompt-guide
- **Implementation File**: `ai-studio/src/lib/ai-prompt-generator.ts`
- **Usage Examples**: `ai-studio/RICH-PROMPTS-README.md`
- **Rollout Guide**: `ai-studio/RICH-PROMPTS-ROLLOUT-GUIDE.md`

## Status

✅ **COMPLETE** - All todos completed:
1. ✅ Integrate Seedream v4 face-swap prompts (both swap modes)
2. ✅ Integrate Seedream v4 target-only prompts
3. ✅ Integrate Seedream v4 enhancement prompts
4. ✅ Remove USE_RICH_STYLE gating; enforce rich prompts
5. ✅ Tighten validation; add Seedream-style fallback
6. ✅ Tune max_tokens/temperature per scenario
7. ✅ Smoke test verification ready

Ready for production deployment.

