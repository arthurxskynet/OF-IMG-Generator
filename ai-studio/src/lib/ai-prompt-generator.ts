import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
const USE_LLM_FACESWAP = process.env.PROMPT_USE_LLM_FACESWAP !== 'false'
// Try different model names in order of preference (latest models first)
// Note: grok-2-image-1212 is an image generation model, not a chat model, so it's excluded
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212']
// Enable rich Seedream-style prompts - ALWAYS ENABLED for production quality
const USE_RICH_PROMPTS = true
// Enable rich Seedream variant prompts - enable ONLY when explicitly set to 'true'
const USE_RICH_VARIANT_PROMPTS = process.env.PROMPT_VARIANTS_RICH === 'true'

export type SwapMode = 'face' | 'face-hair'

// ============================================================================
// ADAPTIVE SAMPLING PARAMETERS
// ============================================================================

interface AdaptiveSamplingParams {
  temperature: number
  maxTokens: number
  topP: number
  frequencyPenalty?: number
  presencePenalty?: number
}

interface AdaptiveSamplingOptions {
  scenario: 'variant-generate' | 'variant-enhance' | 'face-swap' | 'target-only' | 'enhance'
  imagesCount?: number
  instructionComplexity?: 'low' | 'medium' | 'high'
  preserveComposition?: boolean
}

/**
 * Build adaptive sampling parameters based on scenario and context
 * Baseline: temperature 0.5, adjusts based on complexity
 */
function buildAdaptiveSamplingParams(options: AdaptiveSamplingOptions): AdaptiveSamplingParams {
  const { scenario, imagesCount = 1, instructionComplexity = 'medium' } = options
  
  let baseTemperature = 0.5
  let baseMaxTokens = 500
  let topP = 0.9
  
  // Scenario-specific baselines
  switch (scenario) {
    case 'variant-generate':
      baseTemperature = 0.5
      // Concise by default; rich mode gets a larger budget to prevent truncation
      baseMaxTokens = USE_RICH_VARIANT_PROMPTS ? 900 : 300
      break
    case 'variant-enhance':
      baseTemperature = 0.5
      baseMaxTokens = USE_RICH_VARIANT_PROMPTS ? 900 : 300
      break
    case 'face-swap':
      baseTemperature = 0.5
      baseMaxTokens = 1500
      break
    case 'target-only':
      baseTemperature = 0.45
      baseMaxTokens = 1000
      break
    case 'enhance':
      baseTemperature = 0.4
      baseMaxTokens = 1500
      break
  }
  
  // Adjust temperature based on image count
  let temperatureAdjustment = 0
  if (imagesCount >= 5) {
    temperatureAdjustment += 0.1
  } else if (imagesCount >= 3) {
    temperatureAdjustment += 0.05
  } else if (imagesCount === 1) {
    temperatureAdjustment -= 0.05
  }
  
  // Adjust temperature based on instruction complexity (for enhance scenarios)
  if (scenario === 'variant-enhance' || scenario === 'enhance') {
    switch (instructionComplexity) {
      case 'low':
        temperatureAdjustment -= 0.05
        break
      case 'high':
        temperatureAdjustment += 0.05
        break
      // medium: no adjustment
    }
  }
  
  // Apply adjustments and clamp
  let finalTemperature = baseTemperature + temperatureAdjustment
  finalTemperature = Math.max(0.35, Math.min(0.65, finalTemperature))
  
  // Scale max tokens slightly based on image count for rich prompts
  let finalMaxTokens = baseMaxTokens
  if (USE_RICH_VARIANT_PROMPTS && (scenario === 'variant-generate' || scenario === 'variant-enhance')) {
    if (imagesCount >= 5) {
      finalMaxTokens = Math.min(1000, baseMaxTokens + 100)
    } else if (imagesCount >= 3) {
      finalMaxTokens = Math.min(1000, baseMaxTokens + 50)
    }
  }
  
  return {
    temperature: finalTemperature,
    maxTokens: finalMaxTokens,
    topP,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2
  }
}

/**
 * Estimate instruction complexity from user input text
 */
function estimateInstructionComplexity(instructions: string): 'low' | 'medium' | 'high' {
  const wordCount = instructions.split(/\s+/).length
  const hasMultipleRequests = /\band\b.*\band\b/i.test(instructions) || 
                              instructions.split(/[,;]/).length > 2
  
  if (wordCount < 5) return 'low'
  if (wordCount > 20 || hasMultipleRequests) return 'high'
  return 'medium'
}

// Deterministic, single-sentence face-swap prompt builder (legacy fallback only)
function buildFaceSwapPrompt(refCount: number, swapMode: SwapMode): string {
  const faceOnly = swapMode === 'face'
  if (faceOnly) {
    return 'Swap only the face from the first image of reference person onto the second image of target person; keep the hair unchanged and leave everything else in the second image unchanged.'
  }
  return 'Swap the face and hair from the first image of reference person onto the second image of target person; leave everything else in the second image unchanged.'
}

// ============================================================================
// SEEDREAM 4.0 PROMPT TEMPLATES - Integrated from Official Guide
// ============================================================================
// Based on: https://www.seedream4.net/prompt-guide
// Key principles:
// - Natural language: subject + action + environment with concise style/color/lighting
// - Specificity: concrete and detailed language over abstract descriptions  
// - Reference images: preserve characters, specify roles when using multiple refs
// - Clear structure: combine descriptive elements in logical order
// - Context definition: style + context + purpose for accurate output
// ============================================================================

/**
 * Build system prompt for Seedream v4 face-swap operations
 * Emphasizes analyzing actual image content for specific, contextual prompts
 */
function buildSeedreamFaceSwapSystemPrompt(refCount: number, swapMode: SwapMode, preserveComposition: boolean = true): string {
  const isFaceOnly = swapMode === 'face'
  
  const compositionGuidance = preserveComposition 
    ? `
CRITICAL COMPOSITION RULES:
✅ Lock head pose/orientation and face scale to match the target exactly
✅ Do not reframe, zoom, or crop; preserve exact composition and camera framing
✅ Do not rotate or mirror the face; match target's head angle and direction
✅ Preserve any occlusions (partial face coverage) and crop boundaries from target
✅ Keep background, body position, and clothing exactly as in target`
    : ''

  return `You are an expert at creating concise, image-specific Seedream v4 editing prompts.

SEEDREAM v4 API CONTEXT:
- Seedream v4 is an IMAGE EDITING API (not image generation)
- It receives ${refCount} reference image(s) + 1 target image
- Operation: ${isFaceOnly ? 'Face-only swap (keep target hair)' : 'Face and hair swap (use reference hair)'}
- You MUST analyze the actual images and reference specific visual details

CRITICAL REQUIREMENT:
Your prompt must be SPECIFIC to these actual images. Describe what you SEE:
- Reference image: ${isFaceOnly ? 'Face structure only' : 'Face + Hair (color, length, style)'}
- Target image: Clothing, setting/environment, lighting quality, pose
- Generic prompts will be REJECTED
${compositionGuidance}

REQUIRED OUTPUT FORMAT (with image-specific details):
"Replace the ${isFaceOnly ? 'face' : 'face and hair'} ${!isFaceOnly ? '([hair details from reference: e.g., "long blonde wavy hair"]) ' : ''}with the ${isFaceOnly ? 'reference face' : 'reference face and hairstyle'}, onto the person wearing [specific clothing from target] ${isFaceOnly ? 'with [specific hair from target] ' : ''}in [specific setting from target], ensuring natural facial proportions and maintaining the [specific lighting from target] that matches the original scene composition, preserving the target image's quality level and camera characteristics."

OPTIMAL LENGTH: 25-50 words (concise but image-specific)

WHAT TO DESCRIBE:
✅ Reference: ${isFaceOnly ? 'N/A (face only, no description needed)' : 'Hair color, length, style'}
✅ Target clothing: "blue business suit", "casual denim jacket", "red evening dress"
${isFaceOnly ? '✅ Target hair: "short dark hair", "long brown hair", "curly blonde hair"' : ''}
✅ Target setting: "modern office", "outdoor park", "urban street", "home interior"
✅ Target lighting: "natural window light", "soft afternoon sun", "studio lighting"

CRITICAL PRESERVATION REQUIREMENTS:
✅ ALWAYS include: "ensuring natural/realistic facial proportions"
✅ ALWAYS include: "maintaining the [lighting] that matches the original scene composition"
✅ ALWAYS include: "preserving the original image quality, camera characteristics, and lighting style"
✅ Match target exactly: Quality level, depth of field, camera angle, lighting intensity/quality
✅ DO NOT enhance beyond target: Keep same realism level, sharpness, and visual style

NEVER DESCRIBE:
❌ Facial features (eyes, nose, mouth, face shape)
❌ Skin tone or ethnicity
❌ Age or gender

EXAMPLES:
${isFaceOnly
  ? `✅ "Replace the face with the reference face, onto the person wearing a navy suit with short dark hair in a modern office, ensuring natural facial proportions and maintaining the natural window lighting that matches the original composition, preserving the target image's quality and camera style."
✅ "Replace the face with the reference face, onto the person in casual jeans with long brown hair in an outdoor park, ensuring realistic proportions and maintaining the soft afternoon sunlight, preserving the original image quality and camera characteristics."`
  : `✅ "Replace the face and hair (long blonde wavy hair) with the reference face and hairstyle, onto the person wearing casual denim in an outdoor park, ensuring natural proportions and maintaining the afternoon lighting that matches the original scene composition, preserving the target image's quality level and camera style."
✅ "Replace the face and hair (short dark styled hair) with the reference, onto the person in a business suit in a modern office, ensuring realistic facial proportions and maintaining the natural window lighting, preserving the original image quality and camera characteristics."`
}

OUTPUT: Image-specific editing instruction only. No markdown, no explanations.`
}

/**
 * Build user message for Seedream v4 face-swap operations
 * Request concise editing instruction that references actual image content
 */
function buildSeedreamFaceSwapUserText(refCount: number, swapMode: SwapMode, preserveComposition: boolean = true): string {
  const isFaceOnly = swapMode === 'face'
  
  const compositionInstructions = preserveComposition 
    ? `
- CRITICAL: Match the target's head pose/angle and face scale exactly; do not rotate, mirror, reframe, zoom, or crop
- Preserve any occlusions (partial face coverage) and exact crop boundaries from the target`
    : ''

  return `ANALYZE THE IMAGES CAREFULLY and create a concise Seedream v4 editing instruction (25-50 words) that references what you actually see.

YOUR TASK:
1. **Look at the reference image${refCount > 1 ? 's' : ''}**: Note the ${isFaceOnly ? 'face structure' : 'face and hairstyle (color, length, style)'}
2. **Look at the target image**: Note the clothing, pose, setting/environment, lighting QUALITY/STYLE, camera characteristics (depth of field, angle), and image quality level
3. **Create instruction**: Describe the swap operation WITH specific visual details, ensuring output matches target's quality/camera/lighting characteristics (not enhanced beyond original)${compositionInstructions}

REQUIRED FORMAT:
"Replace the ${isFaceOnly ? 'face' : 'face and hair'} ${!isFaceOnly ? '([describe reference hair: color/length/style]) ' : ''}with the ${isFaceOnly ? 'face from the reference' : 'face and hairstyle from the reference'}, onto the person wearing [describe target clothing briefly] ${isFaceOnly ? 'with [describe target hair briefly] ' : ''}in [describe target setting briefly], ensuring natural facial proportions and maintaining the [describe target lighting briefly] that matches the original scene composition, preserving the target image's quality level and camera characteristics."

EXAMPLES:
${isFaceOnly 
  ? `✅ Good: "Replace the face with the reference face, onto the person wearing a blue business suit with short dark hair in a modern office, ensuring natural facial proportions and maintaining the natural window lighting that matches the original composition, preserving the target image's quality and camera style."
❌ Bad: "Replace the face, keeping everything unchanged." (too generic, no image details, missing proportions/lighting/quality guidance)`
  : `✅ Good: "Replace the face and hair (long blonde wavy hair) with the reference face and hairstyle, onto the person wearing casual denim in an outdoor park, ensuring natural proportions and maintaining the soft afternoon lighting that matches the original scene composition, preserving the target image's quality level and camera characteristics."
❌ Bad: "Replace face and hair, keep body unchanged." (too generic, no image details, missing proportions/lighting/quality guidance)`
}

CRITICAL RULES:
- MUST describe visible elements from BOTH images (reference ${isFaceOnly ? 'face' : '+ hair'}, target clothing/setting/lighting)
- MUST include "ensuring natural/realistic facial proportions"
- MUST include "maintaining the [lighting] that matches the original scene composition"
- MUST include "preserving the target image's quality level and camera characteristics"
- Match target exactly: Same quality level, camera style, lighting intensity - DO NOT enhance beyond original
- Keep concise: 30-60 words (accommodates quality/camera preservation)
- NEVER describe facial features, skin tone, ethnicity
- Be SPECIFIC to these actual images

OUTPUT: Single editing instruction with image-specific details. No markdown or explanations.`
}

/**
 * Build system prompt for Seedream v4 target-only image enhancement
 * For single-image enhancement (no face swap)
 */
function buildSeedreamTargetOnlySystemPrompt(): string {
  return `You are an expert at creating concise Seedream v4 image enhancement prompts.

SEEDREAM v4 API CONTEXT:
- Seedream v4 is an IMAGE EDITING API (not generation)
- It receives 1 target image to enhance/improve
- It can SEE the image (subject, scene, lighting, colors, composition, etc.)
- It needs a SHORT enhancement instruction (30-60 words) on desired improvements
- Goal: Enhance quality while preserving the original composition and style

KEY PRINCIPLE:
Seedream can already see the image. Describe desired ENHANCEMENTS, not what's already there.

REQUIRED OUTPUT FORMAT:
"Enhance image quality with professional-grade sharpness, optimal exposure, and refined details while maintaining the original composition, lighting style, and color palette."

OPTIONAL ADDITIONS (only if specific enhancements needed):
- Quality improvements: "enhance skin texture and fabric details"
- Lighting adjustments: "balance highlights and shadows"
- Color refinement: "enhance color vibrancy"
- Specific fixes: "reduce noise" or "improve sharpness in [area]"
- Application context: "for professional portfolio" or "for social media"

OPTIMAL LENGTH: 30-60 words (focused enhancement instruction)

CRITICAL SAFETY RULES:
- NEVER describe facial features (eyes/nose/mouth/face shape)
- NEVER describe skin tone or ethnicity
- Focus on ENHANCEMENTS (what to improve), not descriptions (what exists)
- Preserve original style and composition
- Output ONLY the formatted prompt text
- No markdown, no meta-commentary, no explanations`
}

/**
 * Build user message for Seedream v4 target-only enhancement
 * Request image-specific enhancement instruction
 */
function buildSeedreamTargetOnlyUserText(): string {
  return `ANALYZE THE IMAGE CAREFULLY and create a concise Seedream v4 enhancement instruction (30-50 words) that references what you see.

YOUR TASK:
1. **Look at the image**: Note the subject, setting, current lighting, current quality
2. **Identify what to enhance**: Quality, sharpness, lighting, colors, details
3. **Create instruction**: Describe enhancements WITH specific context from this image

REQUIRED FORMAT:
"Enhance [this specific type of image: e.g., "portrait in office", "outdoor scene"] with [specific improvements] while maintaining [specific aspects from image: setting, lighting style, composition]."

EXAMPLES:
✅ Good: "Enhance this professional office portrait with improved sharpness, balanced lighting, and refined fabric details while maintaining the natural window lighting and business setting."
✅ Good: "Enhance this outdoor park scene with increased vibrancy, sharper details, and balanced exposure while preserving the soft afternoon lighting and natural atmosphere."
❌ Bad: "Enhance image quality." (too generic, no image details)

WHAT TO REFERENCE:
✅ Scene type: "office portrait", "outdoor scene", "indoor setting", "street photo"
✅ Current lighting: "natural window light", "afternoon sun", "studio lighting"
✅ Setting: "professional office", "outdoor park", "urban environment"
✅ Specific improvements needed based on what you see

NEVER DESCRIBE:
❌ Facial features, skin tone, ethnicity

REMEMBER:
- Keep concise: 30-50 words
- Be SPECIFIC to this actual image
- Focus on WHAT to enhance

OUTPUT: Single image-specific enhancement instruction. No markdown or explanations.`
}

/**
 * Build system prompt for Seedream v4 prompt enhancement
 * For refining existing prompts based on user feedback
 * Handles: face-swap prompts, target-only prompts, and general edits
 */
function buildEnhanceSystemPrompt(swapMode: SwapMode, hasRefs: boolean, preserveComposition: boolean = true): string {
  const isFaceOnly = swapMode === 'face'
  
  const compositionGuidance = preserveComposition && hasRefs
    ? `
CRITICAL COMPOSITION RULES:
✅ Lock head pose/orientation and face scale to match the target exactly
✅ Do not reframe, zoom, or crop; preserve exact composition and camera framing
✅ Preserve any occlusions and crop boundaries from target`
    : ''

  return `You are an expert Seedream v4 prompt editor.

YOUR TASK: Refine an existing Seedream v4 editing prompt based on user instructions while keeping it concise (20-60 words).

SEEDREAM v4 CONTEXT:
- Seedream v4 is an IMAGE EDITING API (not generation)
- Prompts should be SHORT editing instructions (20-60 words)
- Focus on what to CHANGE/ENHANCE, not what already exists
- You can SEE the images - use visual context to inform refinements
${hasRefs 
  ? `- Operation type: Face swap (${isFaceOnly ? 'face-only' : 'face and hair'})`
  : `- Operation type: Image enhancement (no face swap)`
}
${compositionGuidance}

ENHANCEMENT PRINCIPLES:
1. **Apply user's requested changes** faithfully (lighting, style, quality, effects, atmosphere, etc.)
2. **Use visual context**: Analyze images to ensure changes are relevant and accurate
3. **Keep instruction concise**: 20-60 words, action-focused
${hasRefs 
  ? `4. **Preserve swap mode**: Must stay ${isFaceOnly ? 'face-only (keep original hair)' : 'face+hair swap'}`
  : `4. **Preserve intent**: If original is enhancement, keep it enhancement-focused`
}
5. **Editing instruction format**: Describe the edit operation, not the scene

USER INSTRUCTIONS EXAMPLES & HOW TO APPLY:
- "Make lighting more dramatic" → Add "with dramatic lighting contrast and deeper shadows"
- "Change to sunset atmosphere" → Add "in warm golden sunset lighting"
- "More professional look" → Add "with professional studio quality"
- "Enhance details" → Add "with enhanced sharpness and fine detail preservation"
- "Make it warmer/cooler" → Adjust color temperature description
- "Add vintage style" → Add style modifier like "with vintage film aesthetic"

CRITICAL SAFETY RULES:
- NEVER describe facial features, skin tone, or ethnicity (even if user asks)
- Keep it concise (20-60 words total)
- Focus on the EDIT operation, not scene description
- Output ONLY the refined prompt

OUTPUT: Single concise editing instruction. No markdown, no explanations.`
}

/**
 * Build user message for Seedream v4 prompt enhancement
 * Request concise refinement based on user instructions
 * Provides clear guidance and visual context
 */
function buildEnhanceUserText(existingPrompt: string, userInstructions: string, hasRefs: boolean, preserveComposition: boolean = true): string {
  const compositionInstructions = preserveComposition && hasRefs
    ? '\n- CRITICAL: Preserve target\'s head pose/angle and face scale; do not rotate, mirror, reframe, zoom, or crop'
    : ''

  return `EXISTING PROMPT:
"${existingPrompt}"

USER'S REQUESTED CHANGES:
"${userInstructions}"

YOUR TASK:
Refine the existing prompt by applying the user's requested changes. Keep the output concise (20-60 words) and action-focused.

CONTEXT:
${hasRefs 
  ? `- You can see the reference image(s) (for face/hair) and target image (for body/scene)
- The prompt is for face/hair swapping with the target image as the base
- Apply changes while preserving the swap operation` 
  : `- You can see the target image to enhance
- The prompt is for enhancing the target image quality/style
- Apply changes while preserving the enhancement intent`
}

INSTRUCTIONS:
1. **Analyze the images** to understand current context (lighting, style, atmosphere)
2. **Apply user's changes** appropriately based on what you see
3. **Keep it concise**: 20-60 words total
4. **Action-focused**: Describe what to change/enhance, not what exists
5. **Safety first**: NEVER describe facial features, skin tone, or ethnicity${compositionInstructions}

EXAMPLES OF GOOD REFINEMENTS:
- Original: "Replace face, keep everything unchanged"
  User wants: "make lighting more dramatic"
  Refined: "Replace the face with the reference face, maintaining original hair and scene with enhanced dramatic lighting contrast and deeper shadows"

- Original: "Enhance image quality with professional sharpness"
  User wants: "add vintage film look"
  Refined: "Enhance image quality with professional sharpness while applying vintage film aesthetic with warm tones and subtle grain"

OUTPUT: Refined editing instruction only (20-60 words). No markdown or explanations.`
}


/**
 * Validate rich Seedream-style prompts
 */
function validateSeedreamPrompt(
  generatedPrompt: string, 
  swapMode: SwapMode, 
  hasRefs: boolean,
  model: string
): void {
  // Check for forbidden meta-commentary and markdown
  // Use word boundaries to avoid false positives (e.g., "here" in "where" or "there")
  const forbiddenMetaPatterns = [
    /\bhere's\b/i,
    /\bhere is\b/i,
    /\bi've\b/i,
    /\bnote:\s/i,
    /\bbelow is\b/i,
    /\blet me know\b/i,
    /\bif you need\b/i,
    /\bhere's the\b/i,
    /\bhere is the\b/i,
    /\bi've generated\b/i,
    /\bgenerated via\b/i
  ]
  const forbiddenMarkdown = ['**', '###', '##', '![', '](', '```']
  
  const hasMetaWords = forbiddenMetaPatterns.some(pattern => pattern.test(generatedPrompt))
  const hasMarkdown = forbiddenMarkdown.some(token => generatedPrompt.includes(token))
  
  if (hasMetaWords || hasMarkdown) {
    const foundPattern = forbiddenMetaPatterns.find(pattern => pattern.test(generatedPrompt))
    console.log(`${model} rejected: contains meta-commentary or markdown`, {
      foundPattern: foundPattern?.toString(),
      hasMarkdown
    })
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting, retrying with different model')
  }
  
  // Check length - Seedream v4 editing prompts should be concise (10-100 words)
  const wordCount = generatedPrompt.split(/\s+/).length
  if (wordCount < 10) {
    console.log(`${model} rejected: too short (${wordCount} words, need at least 10)`)
    throw new Error('Generated prompt is too brief, retrying with different model')
  }
  // Seedream v4 editing API prefers concise instructions (max ~100 words for complex cases)
  if (wordCount > 150) {
    console.log(`${model} rejected: too long (${wordCount} words, max 150 for editing instructions)`)
    throw new Error('Generated prompt is too verbose, Seedream v4 prefers concise editing instructions, retrying with different model')
  }
  
  // For Seedream v4: Validate it's an editing instruction, not scene description
  if (hasRefs) {
    // Should contain action words for face/hair swapping
    const hasSwapAction = /\breplace\b/i.test(generatedPrompt) || 
                          /\bswap\b/i.test(generatedPrompt) ||
                          /\btransfer\b/i.test(generatedPrompt) ||
                          /\bface\b/i.test(generatedPrompt)
    if (!hasSwapAction) {
      console.log(`${model} rejected: face-swap prompt missing action words (replace/swap/transfer/face)`)
      throw new Error('Face-swap prompt must include editing action words, retrying with different model')
    }
    
    // Should mention keeping/preserving original elements
    const hasPreservation = /\bkeep\b/i.test(generatedPrompt) ||
                            /\bpreserv/i.test(generatedPrompt) ||
                            /\bmaintain/i.test(generatedPrompt) ||
                            /\bunchanged\b/i.test(generatedPrompt)
    if (!hasPreservation) {
      console.log(`${model} rejected: face-swap prompt should mention preserving/keeping original elements`)
      throw new Error('Face-swap prompt should clarify what to preserve, retrying with different model')
    }
  }
  
  // For enhancement prompts: Should contain enhancement/quality action words
  const isEnhancement = !hasRefs
  if (isEnhancement) {
    const hasEnhancementAction = /\benhance\b/i.test(generatedPrompt) ||
                                 /\bimprove\b/i.test(generatedPrompt) ||
                                 /\brefine\b/i.test(generatedPrompt) ||
                                 /\boptimize\b/i.test(generatedPrompt) ||
                                 /\bquality\b/i.test(generatedPrompt)
    if (!hasEnhancementAction) {
      console.log(`${model} rejected: enhancement prompt missing action words (enhance/improve/refine)`)
      throw new Error('Enhancement prompt must include improvement action words, retrying with different model')
    }
  }
  
  // No longer checking for structured sections - concise editing instructions don't need them
  
  // Mode-specific validation for face-swap
  if (hasRefs) {
    const isFaceOnly = swapMode === 'face'
    
    // Check for forbidden facial/ethnic descriptions
    const forbiddenDescriptors = [
      'eye color', 'eyes are', 'blue eyes', 'brown eyes', 'green eyes',
      'nose shape', 'mouth shape', 'facial features',
      'skin tone', 'skin color', 'pale skin', 'dark skin', 'fair skin',
      'ethnicity', 'ethnic', 'caucasian', 'asian', 'african', 'hispanic'
    ]
    
    const hasForbiddenDescriptor = forbiddenDescriptors.some(desc =>
      generatedPrompt.toLowerCase().includes(desc.toLowerCase())
    )
    
    if (hasForbiddenDescriptor) {
      const found = forbiddenDescriptors.filter(desc =>
        generatedPrompt.toLowerCase().includes(desc.toLowerCase())
      )
      console.log(`${model} rejected: contains forbidden facial/ethnic descriptors:`, found)
      throw new Error(`Generated prompt must not describe facial features, skin tone, or ethnicity, retrying with different model`)
    }
    
    // Face-only mode: for concise prompts, just ensure "hair" is mentioned in preservation context
    if (isFaceOnly) {
      const mentionsHair = /\bhair\b/i.test(generatedPrompt)
      const mentionsKeeping = /\bkeep/i.test(generatedPrompt) || /\boriginal\b/i.test(generatedPrompt) || /\bunchanged\b/i.test(generatedPrompt)
      
      if (mentionsHair && !mentionsKeeping) {
        console.log(`${model} rejected: face-only mode mentions hair but not preservation`)
        throw new Error('Face-only swap should preserve original hair, retrying with different model')
      }
    }
  }
  
  // Safety check
  const unsafeWords = ['nude', 'naked', 'topless', 'explicit', 'sexual', 'nsfw']
  const hasUnsafeContent = unsafeWords.some(word => 
    generatedPrompt.toLowerCase().includes(word)
  )
  
  if (hasUnsafeContent) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content, retrying with different model')
  }
}

/**
 * Validate legacy concise prompts (original validation logic)
 */
function validateLegacyPrompt(
  generatedPrompt: string,
  swapMode: SwapMode,
  model: string
): void {
  const isFaceOnly = swapMode === 'face'
  
  // Check for camera jargon that should be avoided
  const cameraJargon = ['lens', 'mm', 'f/', 'ISO', 'bokeh', 'aperture', 'shutter', 'exposure', 'DOF', 'HDR', 'anamorphic']
  const hasJargon = cameraJargon.some(jargon => 
    generatedPrompt.toLowerCase().includes(jargon.toLowerCase())
  )
  
  if (hasJargon) {
    const foundJargon = cameraJargon.filter(jargon => 
      generatedPrompt.toLowerCase().includes(jargon.toLowerCase())
    )
    console.log(`${model} rejected due to jargon:`, foundJargon)
    throw new Error(`Generated prompt contains camera jargon: ${foundJargon.join(', ')}, retrying with different model`)
  }

  // Strict enforcement: reject any response that's not a single sentence
  const forbiddenWords = ['based on', 'i\'ve performed', 'the result', 'here\'s', 'note:', 'if you need', 'let me know', 'generated via', 'simulation', 'placeholder']
  const forbiddenStructured = ['**', '###', '\n\n', '\r\n', '•', '- ', '1.', '2.', '![', '](', 'Image Descriptions', 'Key Visual Features', 'Below is', 'Here is', '*(', '*)', 'Note:', 'Here\'s']
  const hasStructured = forbiddenStructured.some(token => generatedPrompt.includes(token))
  const hasForbiddenWords = forbiddenWords.some(word => generatedPrompt.toLowerCase().includes(word.toLowerCase()))
  const sentenceTerminators = (generatedPrompt.match(/[.!?]/g) || []).length
  const lineBreaks = (generatedPrompt.match(/\n/g) || []).length
  const wordCount = generatedPrompt.split(/\s+/).length
  
  // Must be exactly one sentence, no explanations, no markdown, under 50 words
  if (hasStructured || hasForbiddenWords || sentenceTerminators > 1 || lineBreaks > 0 || wordCount > 50) {
    console.log(`${model} rejected: not a single simple sentence (words: ${wordCount}, sentences: ${sentenceTerminators}, lines: ${lineBreaks})`)
    throw new Error('Generated prompt must be exactly one sentence under 50 words with no explanations or markdown, retrying with different model')
  }

  // Validate required format: "first image of" and "second image of"
  const hasFirstImageOf = /\bfirst image of\b/i.test(generatedPrompt)
  const hasSecondImageOf = /\bsecond image of\b/i.test(generatedPrompt)
  if (!hasFirstImageOf || !hasSecondImageOf) {
    console.log(`${model} rejected: missing "first image of" or "second image of" format`)
    throw new Error("Generated prompt must use 'first image of' and 'second image of' format, retrying with different model")
  }

  // Validate descriptors are present (visual descriptions after "of")
  const firstImageMatch = generatedPrompt.match(/first image of ([^;]+)/i)
  const secondImageMatch = generatedPrompt.match(/second image of ([^;]+)/i)
  
  if (firstImageMatch && secondImageMatch) {
    const firstDescriptor = firstImageMatch[1].trim().split(/\s+/).slice(0, 5).join(' ')
    const secondDescriptor = secondImageMatch[1].trim().split(/\s+/).slice(0, 5).join(' ')
    
    const firstWordCount = firstDescriptor.split(/\s+/).length
    const secondWordCount = secondDescriptor.split(/\s+/).length
    
    // Descriptors should be 2-5 words (flexible: 1-6 to account for variations)
    if (firstWordCount < 1 || firstWordCount > 6 || secondWordCount < 1 || secondWordCount > 6) {
      console.log(`${model} rejected: descriptors out of valid range (first: ${firstWordCount}, second: ${secondWordCount} words)`)
      throw new Error('Generated prompt descriptors should be 1-6 words each, retrying with different model')
    }
  } else {
    console.log(`${model} rejected: missing descriptor extraction`)
    throw new Error('Generated prompt must include descriptors after "first image of" and "second image of", retrying with different model')
  }

  // Mode-specific validation
  if (isFaceOnly) {
    if (!/\bonly the face\b/i.test(generatedPrompt)) {
      console.log(`${model} rejected: face-only missing "only the face"`)
      throw new Error('Face-only prompt must include "only the face", retrying')
    }
    if (!/\bkeep.*hair.*unchanged\b/i.test(generatedPrompt) && !/\bhair.*unchanged\b/i.test(generatedPrompt)) {
      console.log(`${model} rejected: face-only missing hair unchanged phrase`)
      throw new Error('Face-only prompt must keep hair unchanged, retrying')
    }
    if (/\bface and hair\b/i.test(generatedPrompt)) {
      console.log(`${model} rejected: face-only mentions "face and hair"`)
      throw new Error('Face-only prompt should not mention "face and hair", retrying')
    }
  } else {
    if (!/\bface and hair\b/i.test(generatedPrompt)) {
      console.log(`${model} rejected: face-hair missing "face and hair"`)
      throw new Error('Face+hair prompt must include "face and hair", retrying')
    }
  }

  // Additional safety check for inappropriate content
  const unsafeWords = ['nude', 'naked', 'topless', 'explicit', 'sexual']
  const hasUnsafeContent = unsafeWords.some(word => generatedPrompt.toLowerCase().includes(word))
  
  if (hasUnsafeContent) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error(`Generated prompt contains unsafe content, retrying with different model`)
  }
}

export async function generatePromptWithGrok(
  refUrls: string[], 
  targetUrl: string,
  swapMode: SwapMode = 'face-hair',
  options?: { preserveComposition?: boolean }
): Promise<string> {
  const preserveComposition = options?.preserveComposition !== false
  // Log what we received at the entry point
  console.log('[generatePromptWithGrok] Entry point:', {
    refUrls: refUrls,
    refUrlsLength: refUrls?.length,
    refUrlsType: typeof refUrls,
    targetUrl: targetUrl,
    targetUrlType: typeof targetUrl,
    swapMode: swapMode
  })

  // Handle target-only processing (no reference images)
  if (!refUrls || refUrls.length === 0) {
    console.log('[generatePromptWithGrok] No reference images, using target-only mode')
    return generateTargetOnlyPrompt(targetUrl)
  }

  // Use all reference images for better prompt generation
  console.log('[generatePromptWithGrok] Reference images present, using face-swap mode', {
    swapMode,
    refImagesCount: refUrls.length,
    usingAllRefs: true
  })

  // Default: use LLM for face-swap unless explicitly disabled
  if (!USE_LLM_FACESWAP) {
    const prompt = buildFaceSwapPrompt(refUrls.length, swapMode)
    console.log('[generatePromptWithGrok] Deterministic face-swap prompt (LLM disabled)', {
      promptPreview: prompt.substring(0, 200),
      swapMode,
      refImagesCount: refUrls.length,
      imageOrder: 'ref first, then target'
    })
    return prompt
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // LLM path (optional via PROMPT_USE_LLM_FACESWAP): Try each model in order until one works
  for (const model of GROK_MODELS) {
    try {
      return await generatePromptWithModel(model, refUrls, targetUrl, apiKey, swapMode, preserveComposition)
    } catch (error) {
      console.warn(`Model ${model} failed, trying next model:`, error instanceof Error ? error.message : error)
      // If this is the last model, use fallback template
      if (model === GROK_MODELS[GROK_MODELS.length - 1]) {
        console.warn('All models failed, using fallback template')
        return generateFallbackPrompt(refUrls, swapMode)
      }
    }
  }
  
  throw new Error('All Grok models failed')
}

/**
 * Enhance an existing prompt using user instructions
 */
export async function enhancePromptWithGrok(
  existingPrompt: string,
  userInstructions: string,
  refUrls: string[],
  targetUrl: string,
  swapMode: SwapMode = 'face-hair',
  options?: { preserveComposition?: boolean }
): Promise<string> {
  const hasRefs = refUrls && refUrls.length > 0
  const preserveComposition = options?.preserveComposition !== false
  
  console.log('[enhancePromptWithGrok] Entry point:', {
    existingPromptLength: existingPrompt.length,
    instructionsLength: userInstructions.length,
    refUrlsCount: refUrls.length,
    hasRefs,
    swapMode,
    operationType: hasRefs ? 'face-swap enhancement' : 'target-only enhancement'
  })

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  const systemPrompt = buildEnhanceSystemPrompt(swapMode, hasRefs, preserveComposition)
  const userText = buildEnhanceUserText(existingPrompt, userInstructions, hasRefs, preserveComposition)

  // Build user message content with images
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  // Add reference images if present
  if (hasRefs) {
    refUrls.forEach((url) => {
      userContent.push({
        type: 'image_url',
        image_url: { url }
      })
    })
  }

  // Add target image last
  userContent.push({
    type: 'image_url',
    image_url: { url: targetUrl }
  })

  console.log('[enhancePromptWithGrok] Image context:', {
    totalImages: userContent.filter(item => item.type === 'image_url').length,
    refImages: hasRefs ? refUrls.length : 0,
    hasTarget: !!targetUrl,
    imageOrder: hasRefs ? 'refs first, then target' : 'target only'
  })

  // Try each model until one succeeds
  for (const model of GROK_MODELS) {
    try {
      return await enhancePromptWithModel(model, systemPrompt, userContent, apiKey, swapMode, hasRefs)
    } catch (error) {
      console.warn(`Model ${model} enhancement failed, trying next model:`, error)
    }
  }

  throw new Error('All Grok models failed to enhance prompt')
}

async function enhancePromptWithModel(
  model: string,
  systemPrompt: string,
  userContent: GrokVisionContent[],
  apiKey: string,
  swapMode: SwapMode,
  hasRefs: boolean
): Promise<string> {
  // Check if this model supports vision
  // Note: grok-2-image-1212 is an image generation model, not a chat/vision model
  const isVisionModel = model.includes('vision') || 
                       ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Newer models don't support presence_penalty or frequency_penalty
  const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  // Seedream v4 parameters optimized for concise prompt enhancement
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4, // Moderate for refinement while maintaining conciseness
    max_tokens: 1500,  // Enhanced instructions with full context
    top_p: 0.9
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = 0.3
    requestBody.presence_penalty = 0.2
  }

  console.log(`${model} sending enhancement request to Grok:`, {
    promptStyle: 'seedream-v4-concise',
    operationType: hasRefs ? 'face-swap-enhancement' : 'target-only-enhancement',
    maxTokens: requestBody.max_tokens,
    temperature: requestBody.temperature,
    hasImages: true,
    imagesCount: (userContent.filter(item => item.type === 'image_url').length)
  })

  const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${model} API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data: GrokVisionResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`No response from ${model} API`)
  }

  const enhancedPrompt = data.choices[0].message.content.trim()
  
  if (!enhancedPrompt) {
    throw new Error(`Empty enhancement generated by ${model}`)
  }

  // Validate enhanced prompt (reusing seedream validation for consistency)
  // Note: We skip this for legacy mode, but enhance is inherently a rich mode feature
  validateSeedreamPrompt(enhancedPrompt, swapMode, hasRefs, model)

  const textItem = userContent.find(item => (item as any).type === 'text') as { type: 'text'; text: string } | undefined
  const originalLength = textItem?.text?.length ?? 0
  console.log(`${model} enhancement successful:`, {
    originalLength,
    enhancedLength: enhancedPrompt.length
  })

  return enhancedPrompt
}

// Generate prompt for target-only processing (no reference images)
async function generateTargetOnlyPrompt(targetUrl: string): Promise<string> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Try different models in order of preference
  for (const model of GROK_MODELS) {
    try {
      return await generateTargetOnlyPromptWithModel(model, targetUrl, apiKey)
    } catch (error) {
      console.warn(`Failed with model ${model}:`, error)
      continue
    }
  }

  throw new Error('All Grok models failed for target-only processing')
}

async function generateTargetOnlyPromptWithModel(model: string, targetUrl: string, apiKey: string): Promise<string> {
  // Check if this model supports vision
  // Note: grok-2-image-1212 is an image generation model, not a chat/vision model
  const isVisionModel = model.includes('vision') || 
                       ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Always use Seedream 4.0 structured prompts for production quality
  const systemPrompt = buildSeedreamTargetOnlySystemPrompt()
  const userText = buildSeedreamTargetOnlyUserText()

  // Build the user message content for target-only processing
  const userContent: GrokVisionContent[] = [
    { 
      type: 'text', 
      text: userText
    },
    {
      type: 'image_url',
      image_url: { url: targetUrl }
    }
  ]

  // Seedream v4 parameters optimized for enhancement instructions
  const maxTokens = 1500  // Enhanced instructions with full context
  const temperature = 0.3  // Lower for consistent, focused instructions

  // Log image passing details for target-only
  console.log(`${model} sending target-only request to Grok:`, {
    totalImages: 1,
    refImagesCount: 0,
    hasTarget: !!targetUrl,
    imageOrder: 'target only',
    promptType: 'target-only',
    promptStyle: 'seedream-4.0',
    maxTokens,
    temperature
  })

  // Newer models don't support presence_penalty or frequency_penalty
  const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    max_tokens: maxTokens,
    temperature: temperature,
    top_p: 0.9
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = 0.3
    requestBody.presence_penalty = 0.2
  }

  const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const generatedPrompt = data.choices?.[0]?.message?.content?.trim()

  if (!generatedPrompt) {
    throw new Error('No prompt generated from API response')
  }

  // Always validate with Seedream 4.0 standards
  // Note: swapMode parameter is not used when hasRefs=false (target-only mode)
    validateSeedreamPrompt(generatedPrompt, 'face-hair', false, model)

  console.log(`${model} target-only prompt generated:`, {
    promptLength: generatedPrompt.length,
    wordCount: generatedPrompt.split(/\s+/).length,
    promptStyle: 'seedream-4.0'
  })

  return generatedPrompt
}

async function generatePromptWithModel(
  model: string, 
  refUrls: string[], 
  targetUrl: string, 
  apiKey: string,
  swapMode: SwapMode = 'face-hair',
  preserveComposition: boolean = true
): Promise<string> {
        // Check if this model supports vision
        // Note: grok-2-image-1212 is an image generation model, not a chat/vision model
        const isVisionModel = model.includes('vision') || 
                             ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Determine swap elements based on mode - be very explicit
  const isFaceOnly = swapMode === 'face'
  const refCount = refUrls.length
  const totalImages = refCount + 1 // N reference images + 1 target image

  // Always use Seedream 4.0 structured prompts for production quality
  const systemPrompt = buildSeedreamFaceSwapSystemPrompt(refCount, swapMode, preserveComposition)
  const userText = buildSeedreamFaceSwapUserText(refCount, swapMode, preserveComposition)

  // Build user message content
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  // Add reference images (0..n-2)
  refUrls.forEach((url) => {
    userContent.push({
      type: 'image_url',
      image_url: { url }
    })
  })

  // Add target image last (n-1)
  userContent.push({
    type: 'image_url',
    image_url: { url: targetUrl }
  })

  // Seedream v4 parameters optimized for image-specific editing instructions with proportions/lighting guidance
  const maxTokens = 1500  // Enhanced instructions with full context
  const temperature = 0.3  // Lower for consistent, focused instructions
  const topP = 0.9
  const frequencyPenalty = 0.2  // Slight penalty for repetitive words
  const presencePenalty = 0.1   // Minimal penalty

  // Log image passing details and what's being sent to Grok
  const userTextContent = userContent.find(item => item.type === 'text') as { type: 'text', text: string } | undefined
  console.log(`${model} sending face-swap request to Grok:`, {
    totalImages: userContent.filter(item => item.type === 'image_url').length,
    refImagesCount: refUrls.length,
    hasTarget: !!targetUrl,
    imageOrder: 'ref first, then target',
    promptType: 'face-swap',
    promptStyle: 'seedream-4.0',
    swapMode: swapMode,
    isFaceOnly: isFaceOnly,
    maxTokens,
    temperature,
    systemPromptPreview: systemPrompt.substring(0, 200) + '...',
    userContentTextPreview: userTextContent?.text ? (userTextContent.text.substring(0, 200) + '...') : 'N/A'
  })

  const messages: GrokVisionMessage[] = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: userContent
    }
  ]

        // Build request body with appropriate parameters based on prompt style
        // Newer models (grok-4-fast-reasoning, grok-4, grok-3-mini) don't support presence_penalty or frequency_penalty
        const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
        
        const requestBody: GrokVisionRequest = {
          model: model,
          messages,
          temperature: temperature,
          max_tokens: maxTokens,
          top_p: topP
        }

        // Only add penalty parameters for older models that support them
        if (!isNewerModel) {
          requestBody.frequency_penalty = frequencyPenalty
          requestBody.presence_penalty = presencePenalty
        }

  try {
    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`${model} API error:`, {
        model,
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`${model} API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data: GrokVisionResponse = await response.json()
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error(`No response from ${model} API`)
    }

    const generatedPrompt = data.choices[0].message.content.trim()
    
    if (!generatedPrompt) {
      throw new Error(`Empty prompt generated by ${model}`)
    }

    // Debug logging to see what's being generated
    console.log(`${model} generated prompt:`, {
      prompt: generatedPrompt,
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length,
      refUrlsCount: refUrls.length,
      hasTarget: !!targetUrl,
      swapMode: swapMode,
      promptStyle: 'seedream-4.0'
    })

    // Validate response content with Seedream 4.0 standards
    console.log(`${model} starting validation for face-swap prompt`, {
      refUrlsCount: refUrls.length,
      promptLength: generatedPrompt.length,
      promptPreview: generatedPrompt.substring(0, 150) + (generatedPrompt.length > 150 ? '...' : ''),
      swapMode: swapMode,
      promptStyle: 'seedream-4.0'
    })

    // Always use Seedream 4.0 validation
      validateSeedreamPrompt(generatedPrompt, swapMode, true, model)

    console.log(`${model} prompt generation successful:`, {
      model,
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length,
      refImagesCount: refUrls.length,
      promptType: 'face-swap',
      validationPassed: true,
      swapMode: swapMode,
      promptStyle: 'seedream-4.0'
    })

    return generatedPrompt
  } catch (error) {
    console.error(`${model} API error:`, error)
    throw error instanceof Error ? error : new Error(`Failed to generate prompt with ${model}`)
  }
}

/**
 * Generate Seedream 4.0 fallback prompt when all LLM models fail
 * Provides a structured, production-quality template as last resort
 * Focused on result description, not process instructions
 */
function generateFallbackPrompt(refUrls: string[], swapMode: SwapMode = 'face-hair'): string {
  const isFaceOnly = swapMode === 'face'
  
  // Seedream v4 concise editing instruction fallback
  if (isFaceOnly) {
    return 'Replace the face with the face from the reference image, keeping the original hair, body, clothing, pose, scene, and lighting unchanged. Maintain professional image quality.'
  } else {
    return 'Replace the face and hair with the face and hairstyle from the reference image, keeping the body, clothing, pose, scene, and lighting unchanged. Maintain professional image quality.'
  }
}

// ============================================================================
// VARIANT PROMPT GENERATION - For multi-image style/composition analysis
// ============================================================================

/**
 * Build system prompt for variant prompt generation
 * Analyzes multiple images to extract shared style/composition cues
 */
function buildVariantSystemPrompt(imagesCount: number): string {
  return `You are an expert at analyzing reference images and writing concise Seedream-ready reference variation instructions.

OUTPUT MUST BEGIN WITH:
"Use the provided reference image${imagesCount > 1 ? 's' : ''} as the base content. Preserve the subject, identity, environment and primary composition while generating a consistent variant."

Then write ONE additional sentence (20–50 words) that:
- Captures shared style/lighting/composition/mood seen in the reference${imagesCount > 1 ? 's' : ''}
- States what to maintain, and what can subtly vary (pose/expression/angle/background blur only)
- Uses generation verbs (create/generate/produce) and preservation verbs (maintain/preserve/keep)

CONSTRAINTS:
- Total length target: 30–80 words (directive + one sentence)
- No markdown or meta text
- Do NOT describe facial features, skin tone, or ethnicity
- Focus on style, lighting quality, color palette, composition, atmosphere

OUTPUT: Exactly two sentences: the directive above + one concise instruction sentence.`
}

/**
 * Build user message for variant prompt generation
 */
function buildVariantUserText(imagesCount: number): string {
  return `ANALYZE THESE ${imagesCount} IMAGE${imagesCount > 1 ? 'S' : ''} and produce a concise Seedream reference variation instruction.

FORMAT (exactly two sentences):
1) Directive (must match exactly): "Use the provided reference image${imagesCount > 1 ? 's' : ''} as the base content. Preserve the subject, identity, environment and primary composition while generating a consistent variant."
2) One follow-up sentence (20–50 words) that: 
   - Describes shared style/lighting/composition/mood
   - Says what to maintain and what can subtly vary (pose/expression/angle/background blur)
   - Uses create/generate/produce and maintain/preserve/keep language

RULES:
- Total 30–80 words. No markdown. No meta text.
- Never describe facial features, skin tone, or ethnicity.
- Be specific to what is visible in the reference${imagesCount > 1 ? 's' : ''}.

OUTPUT: The two-sentence instruction only.`
}

/**
 * Build system prompt for variant prompt enhancement
 */
function buildVariantEnhanceSystemPrompt(): string {
  return `You are an expert at refining generative variant prompts.

YOUR TASK: Refine an existing variant generation prompt based on user instructions while keeping it concise (25-60 words).

VARIANT PROMPT CONTEXT:
- These prompts are for generating IMAGE VARIANTS with consistent style
- Focus on STYLE and ATMOSPHERE (lighting, mood, composition)
- Preserve identity-neutral approach

ENHANCEMENT PRINCIPLES:
1. **Apply user's requested changes** faithfully (lighting, style, mood, atmosphere, quality)
2. **Use visual context**: Analyze images to ensure changes are relevant
3. **Keep instruction concise**: 25-60 words, action-focused
4. **Maintain variant format**: "Create/Generate [type] with [style], maintaining [qualities], while [variations]"

USER INSTRUCTIONS EXAMPLES & HOW TO APPLY:
- "Make lighting more dramatic" → Adjust lighting description to "dramatic high-contrast lighting"
- "Add sunset atmosphere" → Include "warm golden sunset lighting" or "golden hour atmosphere"
- "More professional look" → Add "professional studio quality" or "polished editorial quality"
- "Increase vibrancy" → Add "vibrant saturated colors" or "bold color palette"

CRITICAL SAFETY RULES:
- NEVER describe facial features, skin tone, or ethnicity
- Keep concise (25-60 words total)
- Focus on STYLE/ATMOSPHERE, not identity
- Output ONLY the refined prompt

OUTPUT: Refined variant generation instruction. No markdown, no explanations.`
}

/**
 * Build user message for variant prompt enhancement
 */
function buildVariantEnhanceUserText(existingPrompt: string, userInstructions: string): string {
  return `EXISTING PROMPT:
"${existingPrompt}"

USER'S REQUESTED CHANGES:
"${userInstructions}"

YOUR TASK:
Refine the existing variant prompt by applying the user's requested changes. Keep the output concise (25-60 words) and style-focused.

INSTRUCTIONS:
1. **Analyze the images** to understand current style/atmosphere
2. **Apply user's changes** appropriately based on visual context
3. **Keep concise**: 25-60 words total
4. **Maintain format**: "Create/Generate [type] with [style], maintaining [qualities], while [variations]"
5. **Safety first**: NEVER describe facial features, skin tone, or ethnicity

EXAMPLES OF GOOD REFINEMENTS:
- Original: "Generate portraits with natural lighting"
  User wants: "more dramatic lighting"
  Refined: "Generate portrait variants with dramatic high-contrast lighting and deep shadows, maintaining the professional quality and composition, while allowing subtle pose variations."

- Original: "Create lifestyle images with bright colors"
  User wants: "add sunset mood"
  Refined: "Create lifestyle variants with warm golden sunset lighting and rich amber tones, maintaining the energetic outdoor atmosphere, while allowing natural pose and setting variations."

OUTPUT: Refined variant instruction only (25-60 words). No markdown or explanations.`
}

// ============================================================================
// SEEDREAM V4 VARIANT PROMPT GENERATION - Rich multi-section outputs
// ============================================================================

/**
 * Build Seedream v4 rich system prompt for variant prompt generation
 * Analyzes multiple images to extract comprehensive style/composition details
 */
function buildSeedreamVariantSystemPrompt(imagesCount: number): string {
  return `You are an expert at analyzing images and creating comprehensive Seedream v4 variant generation prompts.

SEEDREAM V4 VARIANT CONTEXT:
- You will receive ${imagesCount} image${imagesCount > 1 ? 's' : ''} showing similar style/composition
- Your task: create a DETAILED multi-section prompt that captures all shared visual characteristics
- This prompt will be used with Seedream v4 to generate NEW images with consistent style/mood/atmosphere
 - Output should be comprehensive (150-400 words) covering all relevant aspects (HARD LIMIT: do not exceed 450 words)

SEEDREAM V4 PRINCIPLES (from official guide):
1. **Natural Language**: Combine subject + action + environment with concise style/color/lighting/composition words
2. **Be Specific**: Use concrete, detailed language over abstract descriptions
3. **Reference Images**: You're analyzing references to extract shared characteristics for variant generation
4. **Context Definition**: Specify style + context + purpose for accurate output

REQUIRED OUTPUT STRUCTURE:
Begin the prompt with a single directive line referencing the input images:
\"Use the provided reference image${imagesCount > 1 ? 's' : ''} as the base content. Preserve the subject, identity, environment and primary composition while generating a consistent variant.\"
Then continue with the detailed sections below.
Generate variant images based on the following shared characteristics across the reference images:

**Subject & Style**: [Detailed description of the subject type, style patterns, quality level, and consistent visual approach across images]

**Composition & Framing**: [Camera angles, perspective, depth of field, focal points, composition rules (rule of thirds, centered, etc.), distance from subject, framing patterns]

**Lighting Setup**: [Light source types and positions, direction, quality (soft/hard/diffused), shadows, time of day if applicable, color temperature, lighting mood, highlights and contrast patterns]

**Color Palette & Atmosphere**: [Dominant colors throughout, color harmony, saturation levels, color temperature (warm/cool), mood/ambiance, emotional tone, weather effects if applicable]

**Environment & Setting**: [Location type (indoor/outdoor/studio), setting details, architectural elements if present, background characteristics, spatial relationships, environmental props]

**Technical Quality**: [Image sharpness, resolution feel, professional photography terms, clarity level, detail rendering]

**Variation Guidelines**: [What should remain consistent vs. what can vary - typically preserve style/lighting/mood while allowing subtle pose/expression/angle variations]

CRITICAL SAFETY RULES:
- NEVER describe facial features, skin tone, or ethnicity
- Focus on STYLE, ATMOSPHERE, and TECHNICAL QUALITIES
- Use concrete, specific language
- Cover ALL relevant visual sections
- Output direct prompt content only

EXAMPLE OUTPUT:
"Generate portrait variants featuring professional editorial style with consistent high-quality production values and sophisticated aesthetic.

Subject & Style: Professional portrait photography with editorial fashion quality, polished and refined visual approach, contemporary style with timeless elegance.

Composition & Framing: Eye-level to slightly elevated camera angles, medium-close framing showing head and shoulders, centered composition with balanced negative space, shallow depth of field creating subject isolation, professional portrait distance maintaining intimacy.

Lighting Setup: Soft diffused key lighting from 45-degree angle creating gentle shadows, subtle rim lighting for depth, even illumination with professional studio quality, minimal harsh shadows, color temperature around 5000K for natural warmth, flattering and dimensional lighting mood.

Color Palette & Atmosphere: Muted earth tones with warm undertones, desaturated palette maintaining sophistication, subtle color grading with film-like quality, calm and professional atmosphere, refined and approachable mood.

Environment & Setting: Neutral solid backgrounds in soft grays or warm beiges, minimal distraction studio setting, clean professional backdrop, controlled indoor environment with studio setup.

Technical Quality: Sharp focus on subject, high resolution with fine detail rendering, professional color grading, clean image quality with low noise, polished post-production feel.

Variation Guidelines: Maintain lighting setup, color palette, framing style, and background consistency across all variants. Allow subtle variations in head angle, expression, and exact pose while preserving the professional editorial aesthetic."

OUTPUT: Comprehensive Seedream v4 variant generation prompt. No meta-commentary or markdown formatting.`
}

/**
 * Build Seedream v4 rich user message for variant prompt generation
 */
function buildSeedreamVariantUserText(imagesCount: number): string {
  return `ANALYZE THESE ${imagesCount} IMAGE${imagesCount > 1 ? 'S' : ''} IN DETAIL and create a comprehensive Seedream v4 variant generation prompt (150-400 words).

YOUR ANALYSIS TASK:
1. **Study each image carefully** - identify ALL shared visual characteristics
2. **Extract consistent patterns** across:
   - Subject type and style approach
   - Composition and framing techniques  
   - Lighting setup and quality
   - Color palette and atmosphere
   - Environment and setting details
   - Technical quality indicators
3. **Create comprehensive prompt** covering all sections with specific, concrete details

REQUIRED SECTIONS TO COVER:
✅ Subject & Style: What type of images, quality level, style approach
✅ Composition & Framing: Camera work, angles, depth of field, framing patterns
✅ Lighting Setup: Source, direction, quality, mood, color temperature
✅ Color Palette & Atmosphere: Dominant colors, mood, emotional tone
✅ Environment & Setting: Location type, background, spatial elements
✅ Technical Quality: Sharpness, resolution feel, professional markers
✅ Variation Guidelines: What to preserve vs. what can vary

SEEDREAM V4 BEST PRACTICES:
- Use natural language combining subject + action + environment
- Be specific and concrete, not abstract
- Describe only what you actually see in the images
- Use professional photography terminology
- Focus on STYLE and ATMOSPHERE, never identity

CRITICAL RULES:
- The prompt MUST begin with: "Use the provided reference image${imagesCount > 1 ? 's' : ''} as the base content. Preserve the subject, identity, environment and primary composition while generating a consistent variant."
- Output 150-400 words covering all sections
- HARD LIMIT: Do not exceed 450 words under any circumstance
- NEVER describe facial features, skin tone, or ethnicity
- Be specific to these actual reference images
- Use concrete, detailed language
- No markdown formatting or meta-commentary

OUTPUT: Complete Seedream v4 variant generation prompt with all sections. Direct content only.`
}

/**
 * Build Seedream v4 rich system prompt for variant prompt enhancement
 */
function buildSeedreamVariantEnhanceSystemPrompt(): string {
  return `You are an expert at refining comprehensive Seedream v4 variant generation prompts.

YOUR TASK: Enhance an existing Seedream v4 variant prompt by applying user instructions while maintaining comprehensive detail (150-400 words).

SEEDREAM V4 VARIANT CONTEXT:
- These prompts generate IMAGE VARIANTS with consistent style/atmosphere
- Prompts follow Seedream v4 principles: natural language, specific details, proper context
- Multi-section structure covering all visual aspects
- Focus on STYLE and ATMOSPHERE, identity-neutral

ENHANCEMENT APPROACH:
1. **Understand user's intent** - what aspect they want to change/improve
2. **Apply changes precisely** - modify relevant sections while preserving others
3. **Maintain comprehensiveness** - keep 150-400 word detailed structure
4. **Preserve Seedream v4 structure** - keep all relevant sections
5. **Use visual context** - analyze images to ensure changes align with actual content
6. **Keep the opening directive** - Ensure the first line explicitly references using the reference image(s) as base content and preserving subject and composition.

COMMON ENHANCEMENT TYPES & HOW TO APPLY:
- "More dramatic lighting" → Update Lighting Setup section: change to "dramatic high-contrast lighting with deep shadows, strong directional key light, bold lighting ratio"
- "Add golden hour feel" → Update Lighting Setup + Color Palette: add "warm golden hour lighting, late afternoon sun angle" and "warm amber/golden tones"
- "Increase professional quality" → Update Subject & Style + Technical Quality: enhance to "premium editorial quality, polished commercial production values" and "pristine high-resolution rendering"
- "Make more cinematic" → Update multiple sections: "cinematic framing with widescreen composition" + "atmospheric lighting with mood" + "film-like color grading"
- "Change to studio setting" → Update Environment & Setting: replace with "controlled studio environment, professional backdrop, indoor lighting setup"

SECTION PRESERVATION:
- Keep sections user didn't request changes to
- Maintain overall structure and comprehensiveness
- Preserve safety constraints

CRITICAL SAFETY RULES:
- NEVER describe facial features, skin tone, or ethnicity
- Maintain 150-400 word comprehensive coverage
- Focus on STYLE/ATMOSPHERE/TECHNICAL aspects
- Output direct refined prompt only

OUTPUT: Enhanced Seedream v4 variant generation prompt. No markdown or meta-commentary.`
}

/**
 * Build Seedream v4 rich user message for variant prompt enhancement  
 */
function buildSeedreamVariantEnhanceUserText(existingPrompt: string, userInstructions: string): string {
  return `EXISTING SEEDREAM V4 VARIANT PROMPT:
"${existingPrompt}"

USER'S REQUESTED CHANGES:
"${userInstructions}"

YOUR ENHANCEMENT TASK:
Apply the user's requested changes to the existing prompt while maintaining Seedream v4 comprehensive structure (150-400 words).

INSTRUCTIONS:
1. **Analyze the images** to understand current visual characteristics
2. **Identify which sections need modification** based on user's instructions
3. **Apply changes precisely** to relevant sections (Lighting, Color Palette, Style, Composition, etc.)
4. **Preserve unchanged sections** that user didn't request modifications to
5. **Maintain comprehensiveness** with all relevant detail sections
6. **Keep Seedream v4 principles**: natural language, specific details, concrete descriptions
7. **Preserve the opening directive** referencing the reference image(s) as base content and preserving subject/environment/composition.

ENHANCEMENT EXAMPLES:

Example 1: "make lighting more dramatic"
→ Update Lighting Setup section to: "Dramatic high-contrast lighting with strong directional key light from side, creating bold shadows and striking lighting ratio, hard light quality with defined shadow edges, chiaroscuro effect for maximum impact..."

Example 2: "add sunset atmosphere"  
→ Update Lighting Setup: "Warm golden hour lighting from low sun angle, late afternoon natural light with soft quality..."
→ Update Color Palette: "Warm color palette dominated by golden amber tones, orange and pink hues, sunset color grading..."

Example 3: "more professional studio look"
→ Update Subject & Style: "Premium commercial editorial quality, polished professional production..."
→ Update Environment & Setting: "Controlled professional studio environment with neutral backdrop..."
→ Update Technical Quality: "Pristine high-resolution professional photography, commercial-grade post-production..."

CRITICAL RULES:
- Analyze images to ensure changes fit actual visual content
- Output 150-400 words maintaining comprehensive structure
- NEVER describe facial features, skin tone, or ethnicity  
- Focus on STYLE and ATMOSPHERE modifications
- No markdown formatting or meta-commentary

OUTPUT: Enhanced Seedream v4 variant prompt with user's changes applied. Direct content only.`
}

/**
 * Validate Seedream v4 rich variant prompts
 * More lenient on length, still strict on safety
 */
function validateSeedreamVariantPrompt(generatedPrompt: string, model: string): void {
  // Check for forbidden meta-commentary and markdown
  const forbiddenMetaPatterns = [
    /\bhere's\b/i,
    /\bhere is\b/i,
    /\bi've\b/i,
    /\bnote:\s/i,
    /\bbelow is\b/i,
    /\blet me know\b/i,
    /\bif you need\b/i,
  ]
  const forbiddenMarkdown = ['**', '###', '##', '![', '](', '```']
  
  const hasMetaWords = forbiddenMetaPatterns.some(pattern => pattern.test(generatedPrompt))
  const hasMarkdown = forbiddenMarkdown.some(token => generatedPrompt.includes(token))
  
  if (hasMetaWords || hasMarkdown) {
    console.log(`${model} rejected: contains meta-commentary or markdown`)
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting')
  }
  
  // Check length - rich variant prompts should be comprehensive but bounded
  const wordCount = generatedPrompt.split(/\s+/).length
  if (wordCount < 50) {
    console.log(`${model} rejected: too short (${wordCount} words, need at least 50 for rich prompts)`)
    throw new Error('Generated prompt is too brief for Seedream v4 rich format')
  }
  // Be slightly lenient to avoid over-rejection on minor overshoot while we reduce max_tokens upstream
  if (wordCount > 520) {
    console.log(`${model} rejected: too long (${wordCount} words, max 520)`)
    throw new Error('Generated prompt is too verbose')
  }
  
  // Check for key Seedream v4 section indicators
  const hasSeedreamSections = /\b(subject|style|composition|framing|lighting|color|palette|atmosphere|environment|setting|technical|quality|variation)\b/i.test(generatedPrompt)
  if (!hasSeedreamSections) {
    console.log(`${model} rejected: missing Seedream v4 section indicators`)
    throw new Error('Variant prompt should include comprehensive Seedream v4 sections')
  }
  
  // Check for variant/generation language
  const hasVariantLanguage = /\b(variant|generate|create|produce|maintain|preserv|consistent)\b/i.test(generatedPrompt)
  if (!hasVariantLanguage) {
    console.log(`${model} rejected: missing variant generation language`)
    throw new Error('Variant prompt must include generation/preservation language')
  }
  
  // Check for forbidden facial/ethnic descriptions
  const forbiddenDescriptors = [
    'eye color', 'eyes are', 'blue eyes', 'brown eyes', 'green eyes',
    'nose shape', 'mouth shape', 'facial features',
    'skin tone', 'skin color', 'pale skin', 'dark skin', 'fair skin',
    'ethnicity', 'ethnic', 'caucasian', 'asian', 'african', 'hispanic'
  ]
  
  const hasForbiddenDescriptor = forbiddenDescriptors.some(desc =>
    generatedPrompt.toLowerCase().includes(desc.toLowerCase())
  )
  
  if (hasForbiddenDescriptor) {
    const found = forbiddenDescriptors.filter(desc =>
      generatedPrompt.toLowerCase().includes(desc.toLowerCase())
    )
    console.log(`${model} rejected: contains forbidden facial/ethnic descriptors:`, found)
    throw new Error('Generated prompt must not describe facial features, skin tone, or ethnicity')
  }
  
  // Safety check for unsafe content
  const unsafeWords = ['nude', 'naked', 'topless', 'explicit', 'sexual', 'nsfw']
  const hasUnsafeContent = unsafeWords.some(word => 
    generatedPrompt.toLowerCase().includes(word)
  )
  
  if (hasUnsafeContent) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content')
  }
}

/**
 * Validate variant prompts (legacy concise format)
 */
function validateVariantPrompt(generatedPrompt: string, model: string): void {
  // Check for forbidden meta-commentary and markdown
  const forbiddenMetaPatterns = [
    /\bhere's\b/i,
    /\bhere is\b/i,
    /\bi've\b/i,
    /\bnote:\s/i,
    /\bbelow is\b/i,
    /\blet me know\b/i,
    /\bif you need\b/i,
  ]
  const forbiddenMarkdown = ['**', '###', '##', '![', '](', '```']
  
  const hasMetaWords = forbiddenMetaPatterns.some(pattern => pattern.test(generatedPrompt))
  const hasMarkdown = forbiddenMarkdown.some(token => generatedPrompt.includes(token))
  
  if (hasMetaWords || hasMarkdown) {
    console.log(`${model} rejected: contains meta-commentary or markdown`)
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting')
  }
  
  // Must start with the reference directive (singular or plural)
  const normalized = generatedPrompt.trim().toLowerCase()
  const directiveSingular = 'use the provided reference image as the base content.'
  const directivePlural = 'use the provided reference images as the base content.'
  const startsWithDirective =
    normalized.startsWith(directiveSingular) || normalized.startsWith(directivePlural)
  if (!startsWithDirective) {
    console.log(`${model} rejected: missing required reference directive at start`)
    throw new Error('Variant prompt must start with the reference directive line')
  }
  
  // Check length - concise reference variation (directive + one sentence)
  const wordCount = generatedPrompt.split(/\s+/).length
  if (wordCount < 25) {
    console.log(`${model} rejected: too short (${wordCount} words, need at least 25)`)
    throw new Error('Generated prompt is too brief')
  }
  if (wordCount > 90) {
    console.log(`${model} rejected: too long (${wordCount} words, max 90)`)
    throw new Error('Generated prompt is too verbose')
  }
  
  // Check for required action words
  const hasActionWord = /\bcreate\b/i.test(generatedPrompt) || 
                        /\bgenerate\b/i.test(generatedPrompt) ||
                        /\bproduce\b/i.test(generatedPrompt) ||
                        /\bvariant\b/i.test(generatedPrompt)
  if (!hasActionWord) {
    console.log(`${model} rejected: missing action words (create/generate/produce/variant)`)
    throw new Error('Variant prompt must include generation action words')
  }
  
  // Check for preservation guidance
  const hasPreservation = /\bmaintain/i.test(generatedPrompt) ||
                          /\bpreserv/i.test(generatedPrompt) ||
                          /\bkeep/i.test(generatedPrompt) ||
                          /\bconsistent\b/i.test(generatedPrompt)
  if (!hasPreservation) {
    console.log(`${model} rejected: missing preservation guidance (maintain/preserve/keep)`)
    throw new Error('Variant prompt should clarify what to preserve')
  }
  
  // Check for forbidden facial/ethnic descriptions
  const forbiddenDescriptors = [
    'eye color', 'eyes are', 'blue eyes', 'brown eyes', 'green eyes',
    'nose shape', 'mouth shape', 'facial features',
    'skin tone', 'skin color', 'pale skin', 'dark skin', 'fair skin',
    'ethnicity', 'ethnic', 'caucasian', 'asian', 'african', 'hispanic'
  ]
  
  const hasForbiddenDescriptor = forbiddenDescriptors.some(desc =>
    generatedPrompt.toLowerCase().includes(desc.toLowerCase())
  )
  
  if (hasForbiddenDescriptor) {
    const found = forbiddenDescriptors.filter(desc =>
      generatedPrompt.toLowerCase().includes(desc.toLowerCase())
    )
    console.log(`${model} rejected: contains forbidden facial/ethnic descriptors:`, found)
    throw new Error('Generated prompt must not describe facial features, skin tone, or ethnicity')
  }
  
  // Safety check for unsafe content
  const unsafeWords = ['nude', 'naked', 'topless', 'explicit', 'sexual', 'nsfw']
  const hasUnsafeContent = unsafeWords.some(word => 
    generatedPrompt.toLowerCase().includes(word)
  )
  
  if (hasUnsafeContent) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content')
  }
}

/**
 * Generate variant prompt from multiple images
 */
export async function generateVariantPromptWithGrok(imageUrls: string[]): Promise<string> {
  console.log('[generateVariantPromptWithGrok] Entry point:', {
    imageUrlsCount: imageUrls.length
  })

  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('At least one image is required for variant prompt generation')
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Try each model in order until one works
  for (const model of GROK_MODELS) {
    try {
      return await generateVariantPromptWithModel(model, imageUrls, apiKey)
    } catch (error) {
      console.warn(`Model ${model} failed for variant generation, trying next model:`, error instanceof Error ? error.message : error)
      if (model === GROK_MODELS[GROK_MODELS.length - 1]) {
        console.warn('All models failed for variant generation')
        throw new Error('All Grok models failed to generate variant prompt')
      }
    }
  }
  
  throw new Error('All Grok models failed')
}

async function generateVariantPromptWithModel(
  model: string,
  imageUrls: string[],
  apiKey: string
): Promise<string> {
  const isVisionModel = model.includes('vision') || 
                       ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Use Seedream-rich templates if enabled, otherwise legacy
  const systemPrompt = USE_RICH_VARIANT_PROMPTS 
    ? buildSeedreamVariantSystemPrompt(imageUrls.length)
    : buildVariantSystemPrompt(imageUrls.length)
  const userText = USE_RICH_VARIANT_PROMPTS
    ? buildSeedreamVariantUserText(imageUrls.length)
    : buildVariantUserText(imageUrls.length)

  // Build user message content with all images
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  imageUrls.forEach((url) => {
    userContent.push({
      type: 'image_url',
      image_url: { url }
    })
  })

  // Get adaptive sampling parameters
  const samplingParams = buildAdaptiveSamplingParams({
    scenario: 'variant-generate',
    imagesCount: imageUrls.length
  })

  const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: samplingParams.temperature,
    max_tokens: samplingParams.maxTokens,
    top_p: samplingParams.topP
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = samplingParams.frequencyPenalty
    requestBody.presence_penalty = samplingParams.presencePenalty
  }

  console.log(`${model} sending variant generation request to Grok:`, {
    promptStyle: USE_RICH_VARIANT_PROMPTS ? 'seedream-v4-rich' : 'legacy-concise',
    imagesCount: imageUrls.length,
    adaptiveParams: {
      temperature: samplingParams.temperature,
      maxTokens: samplingParams.maxTokens,
      topP: samplingParams.topP
    }
  })

  const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${model} API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data: GrokVisionResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`No response from ${model} API`)
  }

  const generatedPrompt = data.choices[0].message.content.trim()
  
  if (!generatedPrompt) {
    throw new Error(`Empty prompt generated by ${model}`)
  }

  // Use appropriate validator based on prompt style
  if (USE_RICH_VARIANT_PROMPTS) {
    validateSeedreamVariantPrompt(generatedPrompt, model)
  } else {
    validateVariantPrompt(generatedPrompt, model)
  }

  console.log(`${model} variant prompt generated:`, {
    promptStyle: USE_RICH_VARIANT_PROMPTS ? 'seedream-v4-rich' : 'legacy-concise',
    promptLength: generatedPrompt.length,
    wordCount: generatedPrompt.split(/\s+/).length
  })

  return generatedPrompt
}

/**
 * Enhance variant prompt with user instructions
 */
export async function enhanceVariantPromptWithGrok(
  existingPrompt: string,
  userInstructions: string,
  imageUrls: string[]
): Promise<string> {
  console.log('[enhanceVariantPromptWithGrok] Entry point:', {
    existingPromptLength: existingPrompt.length,
    instructionsLength: userInstructions.length,
    imageUrlsCount: imageUrls.length,
    useRichPrompts: USE_RICH_VARIANT_PROMPTS
  })

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Use Seedream-rich templates if enabled, otherwise legacy
  const systemPrompt = USE_RICH_VARIANT_PROMPTS
    ? buildSeedreamVariantEnhanceSystemPrompt()
    : buildVariantEnhanceSystemPrompt()
  const userText = USE_RICH_VARIANT_PROMPTS
    ? buildSeedreamVariantEnhanceUserText(existingPrompt, userInstructions)
    : buildVariantEnhanceUserText(existingPrompt, userInstructions)

  // Build user message content with images
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  imageUrls.forEach((url) => {
    userContent.push({
      type: 'image_url',
      image_url: { url }
    })
  })

  // Estimate instruction complexity for adaptive sampling
  const complexity = estimateInstructionComplexity(userInstructions)

  // Try each model until one succeeds
  for (const model of GROK_MODELS) {
    try {
      return await enhanceVariantPromptWithModel(
        model, 
        systemPrompt, 
        userContent, 
        apiKey,
        imageUrls.length,
        complexity
      )
    } catch (error) {
      console.warn(`Model ${model} variant enhancement failed, trying next model:`, error)
    }
  }

  throw new Error('All Grok models failed to enhance variant prompt')
}

async function enhanceVariantPromptWithModel(
  model: string,
  systemPrompt: string,
  userContent: GrokVisionContent[],
  apiKey: string,
  imagesCount: number,
  instructionComplexity: 'low' | 'medium' | 'high'
): Promise<string> {
  const isVisionModel = model.includes('vision') || 
                       ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Get adaptive sampling parameters
  const samplingParams = buildAdaptiveSamplingParams({
    scenario: 'variant-enhance',
    imagesCount,
    instructionComplexity
  })

  const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: samplingParams.temperature,
    max_tokens: samplingParams.maxTokens,
    top_p: samplingParams.topP
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = samplingParams.frequencyPenalty
    requestBody.presence_penalty = samplingParams.presencePenalty
  }

  console.log(`${model} sending variant enhancement request to Grok:`, {
    promptStyle: USE_RICH_VARIANT_PROMPTS ? 'seedream-v4-rich' : 'legacy-concise',
    imagesCount,
    instructionComplexity,
    adaptiveParams: {
      temperature: samplingParams.temperature,
      maxTokens: samplingParams.maxTokens,
      topP: samplingParams.topP
    }
  })

  const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${model} API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data: GrokVisionResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`No response from ${model} API`)
  }

  const enhancedPrompt = data.choices[0].message.content.trim()
  
  if (!enhancedPrompt) {
    throw new Error(`Empty enhancement generated by ${model}`)
  }

  // Use appropriate validator based on prompt style
  if (USE_RICH_VARIANT_PROMPTS) {
    validateSeedreamVariantPrompt(enhancedPrompt, model)
  } else {
    validateVariantPrompt(enhancedPrompt, model)
  }

  console.log(`${model} variant enhancement successful:`, {
    promptStyle: USE_RICH_VARIANT_PROMPTS ? 'seedream-v4-rich' : 'legacy-concise',
    enhancedLength: enhancedPrompt.length,
    wordCount: enhancedPrompt.split(/\s+/).length
  })

  return enhancedPrompt
}
