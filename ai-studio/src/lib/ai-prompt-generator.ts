import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
const USE_LLM_FACESWAP = process.env.PROMPT_USE_LLM_FACESWAP !== 'false'
// Try different model names in order of preference (latest models first)
// Note: grok-2-image-1212 is an image generation model, not a chat model, so it's excluded
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212']
// Enable rich Seedream-style prompts - ALWAYS ENABLED for production quality
const USE_RICH_PROMPTS = true

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
      baseTemperature = 0.45 // Lower for more consistent outputs
      baseMaxTokens = 400 // Optimized for variant generation
      break
    case 'variant-enhance':
      baseTemperature = 0.45 // Lower for more consistent refinement
      baseMaxTokens = 400 // Optimized for variant enhancement
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
  
  // Scale max tokens based on image count and mode
  let finalMaxTokens = baseMaxTokens
  if (scenario === 'variant-generate' || scenario === 'variant-enhance') {
    // Increase tokens for 3+ images (better quality with more context)
    if (imagesCount >= 5) {
      finalMaxTokens = Math.min(500, baseMaxTokens + 50)
    } else if (imagesCount >= 3) {
      finalMaxTokens = Math.min(450, baseMaxTokens + 50)
    }
  }
  
  // Fine-tune penalty parameters for variant scenarios
  let frequencyPenalty = 0.3
  let presencePenalty = 0.2
  
  if (scenario === 'variant-generate' || scenario === 'variant-enhance') {
    // Slightly lower penalties for variants to allow more creative transformations
    frequencyPenalty = 0.25
    presencePenalty = 0.15
  }
  
  return {
    temperature: finalTemperature,
    maxTokens: finalMaxTokens,
    topP,
    frequencyPenalty,
    presencePenalty
  }
}

/**
 * Estimate instruction complexity from user input text
 * Enhanced with structure and punctuation analysis
 */
function estimateInstructionComplexity(instructions: string): 'low' | 'medium' | 'high' {
  const trimmed = instructions.trim()
  if (!trimmed) return 'low'
  
  const wordCount = trimmed.split(/\s+/).length
  
  // Early exit for very short instructions
  if (wordCount < 5) return 'low'
  
  // Detect multiple clauses using punctuation and conjunctions
  const clauseCount = (trimmed.match(/[,;]/g) || []).length
  const hasMultipleAnds = (trimmed.match(/\band\b/gi) || []).length >= 2
  const hasMultipleRequests = hasMultipleAnds || clauseCount > 2
  
  // Detect structured instructions (lists, commands with multiple actions)
  const hasListStructure = /^[^a-z]*[a-z][^.]*[.,]\s*[^a-z]*[a-z]/i.test(trimmed) // Multiple sentences
  const hasQuestionMark = trimmed.includes('?')
  const hasMultipleActions = (trimmed.match(/\b(make|change|add|remove|adjust|enhance|improve)\b/gi) || []).length > 1
  
  // Complex indicators: multiple clauses, structured format, or multiple action verbs
  const complexityIndicators = hasMultipleRequests || hasListStructure || hasMultipleActions
  
  // High complexity: long instructions OR multiple complexity indicators
  if (wordCount > 20 || complexityIndicators) return 'high'
  
  // Medium complexity: moderate length with some structure
  if (wordCount > 10 || clauseCount > 0 || hasQuestionMark) return 'medium'
  
  // Low complexity: short, simple instructions
  return 'low'
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
6. **Prevent selective degradation**: Preserve face sharpness and detail quality while applying enhancements
7. **Lighting quality**: Use technical photography terms (balanced exposure, soft directional illumination, even lighting distribution)

USER INSTRUCTIONS EXAMPLES & HOW TO APPLY:
- "Make lighting more dramatic" → Add "with dramatic lighting contrast and deeper shadows, preserving face detail"
- "Change to sunset atmosphere" → Add "in warm golden sunset lighting with balanced exposure, maintaining face sharpness"
- "More professional look" → Add "with professional studio quality and even lighting distribution, preserving facial detail"
- "Enhance details" → Add "with enhanced sharpness and fine detail preservation, maintaining consistent quality across face and background"
- "Make it warmer/cooler" → Adjust color temperature description while preserving face quality
- "Add vintage style" → Add style modifier like "with vintage film aesthetic, preserving face detail and sharpness"

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
5. **Preserve face quality**: Maintain facial features clarity and avoid selective degradation - ensure consistent quality across face and background
6. **Lighting improvements**: Use technical terms like "balanced exposure", "soft directional illumination", "even lighting distribution" when enhancing lighting
7. **Safety first**: NEVER describe facial features, skin tone, or ethnicity${compositionInstructions}

EXAMPLES OF GOOD REFINEMENTS:
- Original: "Replace face, keep everything unchanged"
  User wants: "make lighting more dramatic"
  Refined: "Replace the face with the reference face, maintaining original hair and scene with enhanced dramatic lighting contrast and deeper shadows, preserving face detail"

- Original: "Enhance image quality with professional sharpness"
  User wants: "add vintage film look"
  Refined: "Enhance image quality with professional sharpness while applying vintage film aesthetic with warm tones and subtle grain, maintaining face clarity"

- Original: "Replace face, keep everything unchanged"
  User wants: "improve lighting quality"
  Refined: "Replace the face with the reference face, maintaining original hair and scene with balanced exposure and soft directional illumination, preserving facial detail"

OUTPUT: Refined editing instruction only (20-60 words). No markdown or explanations.`
}


/**
 * Validate Seedream prompts - simplified to only essential checks
 */
function validateSeedreamPrompt(
  generatedPrompt: string, 
  swapMode: SwapMode, 
  hasRefs: boolean,
  model: string
): void {
  // Basic sanity check - must not be empty
  if (!generatedPrompt || generatedPrompt.trim().length < 5) {
    console.log(`${model} rejected: empty or too short`)
    throw new Error('Generated prompt is too brief, retrying with different model')
  }
  
  // Check for forbidden meta-commentary and markdown (formatting issues)
  const metaPattern = /\b(here's|here is|i've|note:|below is|let me know|if you need|generated via)\b/i
  const markdownPattern = /(\*\*|###|##|!\[|\]\(|```)/
  
  if (metaPattern.test(generatedPrompt) || markdownPattern.test(generatedPrompt)) {
    console.log(`${model} rejected: contains meta-commentary or markdown`)
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting, retrying with different model')
  }
  
  // Safety check - forbidden content
  const unsafePattern = /\b(nude|naked|topless|explicit|sexual|nsfw)\b/i
  if (unsafePattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content, retrying with different model')
  }
  
  // Safety check - forbidden facial/ethnic descriptors
  const forbiddenPattern = /\b(eye color|eyes are|blue eyes|brown eyes|green eyes|nose shape|mouth shape|facial features|skin tone|skin color|pale skin|dark skin|fair skin|ethnicity|ethnic|caucasian|asian|african|hispanic)\b/i
  if (forbiddenPattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected: contains forbidden facial/ethnic descriptors`)
    throw new Error('Generated prompt must not describe facial features, skin tone, or ethnicity, retrying with different model')
  }
}

/**
 * Validate legacy concise prompts - simplified to only essential checks
 * Note: This function is kept for backwards compatibility but may not be actively used
 */
function validateLegacyPrompt(
  generatedPrompt: string,
  swapMode: SwapMode,
  model: string
): void {
  // Basic sanity check - must not be empty
  if (!generatedPrompt || generatedPrompt.trim().length < 5) {
    console.log(`${model} rejected: empty or too short`)
    throw new Error('Generated prompt is too brief, retrying with different model')
  }
  
  // Check for forbidden meta-commentary and markdown (formatting issues)
  const metaPattern = /\b(here's|here is|i've|note:|below is|let me know|if you need|generated via)\b/i
  const markdownPattern = /(\*\*|###|##|!\[|\]\(|```)/
  
  if (metaPattern.test(generatedPrompt) || markdownPattern.test(generatedPrompt)) {
    console.log(`${model} rejected: contains meta-commentary or markdown`)
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting, retrying with different model')
  }
  
  // Safety check - forbidden content
  const unsafePattern = /\b(nude|naked|topless|explicit|sexual|nsfw)\b/i
  if (unsafePattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content, retrying with different model')
  }
  
  // Safety check - forbidden facial/ethnic descriptors
  const forbiddenPattern = /\b(eye color|eyes are|blue eyes|brown eyes|green eyes|nose shape|mouth shape|facial features|skin tone|skin color|pale skin|dark skin|fair skin|ethnicity|ethnic|caucasian|asian|african|hispanic)\b/i
  if (forbiddenPattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected: contains forbidden facial/ethnic descriptors`)
    throw new Error('Generated prompt must not describe facial features, skin tone, or ethnicity, retrying with different model')
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
    promptStyle: 'seedream-4.0',
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
 * Enhanced with optional Seedream 4.0 realism guidance
 */
function buildVariantSystemPrompt(imagesCount: number): string {
  return `Create a simple Seedream v4 variant prompt optimized for image editing.

SEEDREAM 4.0 EDITING FORMULA (CRITICAL - Follow This Structure):
- Seedream 4.0 uses: Action + Object + Attribute
- Structure your prompts as: [Action] + [Object] + [Attribute]
- Example: "Change the knight's helmet to gold"
  * Action: "Change"
  * Object: "the knight's helmet"
  * Attribute: "to gold"
- For variants: "Return [object] exactly as is: [action], maintaining [attributes]"
- Seedream is an IMAGE EDITING API - it can see the images, so focus on the edit operation, not descriptions

EXPLICIT ACTION TYPES (Seedream 4.0 Standard):
Use clear action verbs that specify the operation type:
- REPLACE: "Replace expression with smile", "Replace pose with slight head turn"
- MODIFY: "Modify expression slightly", "Modify head angle"
- ADD: "Add subtle smile", "Add slight head movement"
- CHANGE: "Change expression to smile", "Change pose to face left"
- RETURN: "Return her looking to the left" (for direction changes)
- MAKE: "Make them smile" (for expression changes)
Choose the most appropriate action type for the specific change needed.

FORMAT SELECTION (Choose based on image complexity):

SIMPLE IMAGES (face fully visible, standard composition):
"Take [relative reference] and [action], keeping everything else the exact same."

COMPLEX IMAGES (partial face, off-frame, unusual composition):
"Return image exactly as is: [action], maintaining the exact same framing and composition."

FRAMING DETECTION (CRITICAL - Be Conservative):
- DEFAULT: Use SIMPLE format unless there is CLEAR evidence of partial framing
- Only use COMPLEX format when face is OBVIOUSLY partially visible or off-frame
- Clear indicators of partial framing:
  * Face is clearly cut off at top/bottom (e.g., only chin and mouth visible, or only forehead visible)
  * Face is clearly off-frame (e.g., face extends beyond image edge)
  * Face is significantly cropped (e.g., showing only lower half, upper half missing)
  * Casual snapshots showing only bottom of face (chin, mouth, neck visible; eyes not visible)
- DO NOT use complex format for:
  * Normal portraits with full face visible
  * Standard compositions even if slightly off-center
  * Images where face is fully visible but at edge of frame
  * Professional or studio photos
- When in doubt, use SIMPLE format
- Never assume features that aren't visible in the image

WHEN TO USE COMPLEX FORMAT (Only if OBVIOUS):
- Face is CLEARLY partially visible (e.g., only bottom half, only top half, clearly cut off)
- Face is CLEARLY off-frame (face extends beyond image boundaries)
- Face is SIGNIFICANTLY cropped (major portion missing)
- Casual snapshots where face is OBVIOUSLY incomplete (especially bottom-only faces)

VISIBILITY-BASED ACTION RULES (CRITICAL - Match Actions to Visible Features):
Before suggesting any action, analyze what parts of the face are actually visible:

BOTTOM-ONLY FACE VISIBLE (chin, mouth, lower face visible; eyes NOT visible):
✅ VALID actions: "make them smile", "change mouth expression", "adjust head angle slightly", "subtle pose variation"
❌ INVALID actions: "looking to the left/right", "change eye direction", "looking at camera", "return her looking" (eyes not visible, cannot change eye direction)

TOP-ONLY FACE VISIBLE (forehead, eyes, upper face visible; mouth NOT visible):
✅ VALID actions: "looking to the left/right", "change eye direction", "looking at camera", "eyebrow changes"
❌ INVALID actions: "make them smile", "change mouth expression" (mouth not visible, cannot change smile)

FULL FACE VISIBLE (all features visible):
✅ Any appropriate action is valid

OFF-FRAME OR SIGNIFICANTLY CROPPED:
✅ Only suggest subtle variations or composition changes
❌ Avoid specific facial feature changes that require invisible parts

WHEN TO USE SIMPLE FORMAT (Default - Use This Most of the Time):
- Face is fully visible (even if at edge of frame)
- Standard portrait or composition
- Professional or studio-style images
- Normal selfies or photos
- When face visibility is unclear or ambiguous

RELATIVE REFERENCE (for simple format - identify subject clearly):
- Look at the ACTUAL image and identify ONE distinctive element
- Clothing: "the woman with a white tank top" (only if white tank top is actually visible)
- Setting: "the person in the pink room" (only if pink room is actually visible)
- Pose: "the woman looking at camera" (only if actually looking at camera)
- Choose ONE most distinctive element that is ACTUALLY visible in the image
- Be specific and accurate - reference what you actually see, not assumptions
- Only needed for simple format

MULTI-IMAGE ROLE SPECIFICATION${imagesCount > 1 ? ` (${imagesCount} images provided):` : ' (when multiple images provided):'}
${imagesCount > 1 ? `- You have ${imagesCount} reference image(s) - specify what each provides for precision
- Example roles: "character from Image 1, style from Image 2, background from Image 3"
- When multiple images: identify common elements across images for consistency
- Specify which image provides which aspect (character, style, setting, composition)
- This ensures Seedream knows how to use each reference image` : `- If multiple images are provided, specify roles: "character from Image 1, style from Image 2"
- This ensures Seedream knows how to use each reference image`}

ACTION (what to change - MUST match visible features and use explicit Action + Object + Attribute):
- FIRST: Analyze what parts of face are visible (bottom-only, top-only, full face, off-frame)
- THEN: Structure action using Action + Object + Attribute formula
- ACTION TYPE: Choose explicit action verb (Replace, Modify, Add, Change, Return, Make)
- OBJECT: Identify what to change (expression, pose, head angle, direction)
- ATTRIBUTE: Specify the new state (smile, looking left, slight turn)
- For BOTTOM-ONLY faces: Use smile/mouth/head angle actions only (eyes not visible)
  * Example: "Modify expression to smile" (Action: Modify, Object: expression, Attribute: smile)
  * Example: "Change mouth expression slightly" (Action: Change, Object: mouth expression, Attribute: slightly)
- For TOP-ONLY faces: Use eye direction/eyebrow actions only (mouth not visible)
  * Example: "Replace eye direction to looking left" (Action: Replace, Object: eye direction, Attribute: looking left)
  * Example: "Modify gaze to face camera" (Action: Modify, Object: gaze, Attribute: face camera)
- For FULL faces: Any appropriate action with clear structure
  * Example: "Replace pose with slight head turn" (Action: Replace, Object: pose, Attribute: slight head turn)
  * Example: "Modify expression to smile" (Action: Modify, Object: expression, Attribute: smile)
- For OFF-FRAME: Only subtle variations or composition changes
- NEVER suggest actions for features that aren't visible
- Always structure as: [Action] + [Object] + [Attribute]
- For complex format: include framing constraints in the action only if face is OBVIOUSLY partially visible

OPTIONAL REALISM CONTEXT (for low-effort phone photo aesthetics):
If the image suggests a casual, unedited phone photo style, you may optionally include:
- Camera context: "taken on an older smartphone", "front camera selfie"
- Lighting: "flat indoor lighting", "slightly underexposed"
- Imperfections: "slight digital noise", "front-camera softness"
- Anti-studio: "avoiding studio lighting", "no cinematic look"
Keep these brief and natural within the action description.

IMPORTANT - AVOID QUALITY-ENHANCING TERMS FOR DEGRADATION:
If the image appears to be a casual phone photo or user requests degradation/low-quality effects:
- DO NOT add: "8K", "ultra detailed", "studio lighting", "cinematic", "balanced exposure", "professional quality", "high resolution", "crystal clear", "perfectly sharp", "tack sharp", "ultra realistic", "4K", "hyper-detailed", "beauty filters", "ultra-HD filters", "studio polish", "professional shoot"
- DO use: specific camera types, realistic lighting flaws, natural imperfections, phone camera characteristics
- Focus on realistic phone snapshot qualities, not professional photography

NATIVE LANGUAGE HANDLING (Seedream 4.0 Principle):
- For professional or cultural terms, use original language when appropriate
- Style terms: Use native language (e.g., "chiaroscuro" for Italian lighting style)
- Technical terms: Prefer English for consistency (e.g., "high-resolution", "depth of field")
- Cultural references: Use original language for accuracy
- Keep prompts primarily in English, but preserve important native terms

RULES:
- 15-35 words total (can be slightly longer for complex format)
- DEFAULT to SIMPLE format - only use complex format when face is OBVIOUSLY partially visible/off-frame
- NEVER describe facial features, skin tone, or ethnicity
- For complex images (only when obvious): use "Return image exactly as is:" format
- For simple images (default): use "Take [reference] and [action]" format
- When in doubt about face visibility, use SIMPLE format
- Always maintain the exact same framing/visibility in the variant
- Never assume features that aren't visible in the image
- Realism details are optional - only include if naturally fitting

EXAMPLES (Simple Format - showing Action + Object + Attribute structure):
✅ "Take the woman with a white tank top and replace her gaze direction to looking left, keeping everything else the exact same." (Action: replace, Object: gaze direction, Attribute: looking left)
✅ "Take the person in the pink room and modify their expression to smile, keeping everything else the exact same." (Action: modify, Object: expression, Attribute: smile)
✅ "Take the woman looking at camera and change her pose to slight head turn in a casual phone snapshot style with flat indoor lighting, keeping everything else the exact same." (Action: change, Object: pose, Attribute: slight head turn)

EXAMPLES (Complex Format - for partial faces, off-frame):
✅ "Return image exactly as is: modify expression to smile, maintaining the exact same framing showing only bottom of face." (bottom-only: Action: modify, Object: expression, Attribute: smile)
✅ "Return image exactly as is: change mouth expression slightly, maintaining the exact same framing showing only bottom of face." (bottom-only: Action: change, Object: mouth expression, Attribute: slightly)
✅ "Return image exactly as is: replace eye direction to looking left, maintaining the exact same framing showing only top of face." (top-only: Action: replace, Object: eye direction, Attribute: looking left)
✅ "Return image exactly as is: modify expression to smile, maintaining the exact same framing with face partially off-frame." (if mouth visible: Action: modify, Object: expression, Attribute: smile)
✅ "Return image exactly as is: change pose slightly, maintaining the exact same casual off-frame snapshot composition." (Action: change, Object: pose, Attribute: slightly)
❌ BAD: "Return image exactly as is: replace eye direction to looking left, maintaining the exact same framing showing only bottom of face." (eyes not visible, cannot change eye direction)

OUTPUT: One sentence only. No markdown.`
}

/**
 * Build user message for variant prompt generation
 * Enhanced with optional Seedream 4.0 realism context
 */
function buildVariantUserText(imagesCount: number): string {
  return `Look at the image${imagesCount > 1 ? 's' : ''} and create a simple variant prompt optimized for Seedream 4.0 editing.

SEEDREAM 4.0 GUIDANCE:
- Seedream 4.0 is an IMAGE EDITING API - it can see the images, so focus on the edit operation
- Use editing formula: Action + Object + Attribute (CRITICAL - structure all prompts this way)
- Structure: [Action] + [Object] + [Attribute]
  * Action: Replace, Modify, Add, Change, Return, Make
  * Object: expression, pose, gaze direction, head angle
  * Attribute: smile, looking left, slight turn
- For variants: "Return [object] exactly as is: [action], maintaining [attributes]"
- Keep prompts concise and action-oriented (15-35 words)
- Use explicit action types (Replace, Modify, Add, Change) for clarity

FORMAT SELECTION:
Choose format based on image complexity:

SIMPLE IMAGES (face fully visible, standard composition):
"Take [relative reference] and [action], keeping everything else the exact same."

COMPLEX IMAGES (partial face, off-frame, unusual composition):
"Return image exactly as is: [action], maintaining the exact same framing and composition."

STEPS:
0. DETECT COMPLEXITY (Be Conservative - Default to Simple):
   - Is face FULLY visible? → Use SIMPLE format (this is the default)
   - Is face OBVIOUSLY partially visible/off-frame? (e.g., clearly cut off at top/bottom, extends beyond frame) → Use COMPLEX format
   - Is face visibility unclear or ambiguous? → Use SIMPLE format (when in doubt, use simple)
   - Only use COMPLEX format if there is CLEAR, OBVIOUS evidence of partial framing
   - Note: Most images should use SIMPLE format

0.5. ANALYZE VISIBILITY (CRITICAL - Match Actions to Visible Features):
   - What parts of the face are actually visible?
   - Bottom-only? (chin, mouth visible; eyes NOT visible) → Only use smile/mouth/head angle actions
   - Top-only? (eyes, forehead visible; mouth NOT visible) → Only use eye direction/eyebrow actions
   - Full face? (all features visible) → Any appropriate action
   - Off-frame? (face extends beyond frame) → Only subtle variations
   - NEVER suggest actions for features that aren't visible

1. CHOOSE FORMAT:
   - DEFAULT: Use SIMPLE format ("Take [relative reference] and [action]")
   - Only use COMPLEX format if face is OBVIOUSLY partially visible or off-frame
   - When in doubt, choose SIMPLE format

2. FOR SIMPLE FORMAT (Default - Use This Most of the Time):
   - Look at the ACTUAL image and identify ONE key element that is clearly visible
   - Be accurate: only reference what you actually see (clothing, setting, or pose)
   - Create relative reference: "the woman with [clothing]" OR "the person in [setting]" OR "the woman [pose]"
   - Add action: Structure as Action + Object + Attribute
     * Choose explicit action type: Replace, Modify, Add, Change, Return, Make
     * Identify object: expression, pose, gaze, head angle
     * Specify attribute: smile, looking left, slight turn
   - Example structure: "replace [object] with [attribute]" or "modify [object] to [attribute]"
   - Verify action matches visible features (see step 0.5)
   - Be specific and accurate to the actual image content
   ${imagesCount > 1 ? `- If multiple images: Specify roles (e.g., "character from Image 1, style from Image 2")` : ''}

3. FOR COMPLEX FORMAT (Only When Face is OBVIOUSLY Partial):
   - Only use if face is CLEARLY cut off, off-frame, or significantly cropped
   - Skip relative reference (not needed for complex format)
   - Start with "Return image exactly as is:"
   - Add action with framing constraints: Structure as Action + Object + Attribute
   - CRITICAL: Action MUST match visible features (see step 0.5)
     * Bottom-only face: Use "modify expression to smile", "change mouth expression" (Action: modify/change, Object: expression/mouth, Attribute: smile) - NOT eye direction
     * Top-only face: Use "replace eye direction to looking left", "modify gaze to face camera" (Action: replace/modify, Object: eye direction/gaze, Attribute: looking left/face camera) - NOT smile changes
   - Structure: "[Action] [Object] to [Attribute], maintaining the exact same framing [framing description]"
   - Only include framing description if face is OBVIOUSLY partially visible
   - Example (bottom-only): "Return image exactly as is: modify expression to smile, maintaining the exact same framing showing only bottom of face." (Action: modify, Object: expression, Attribute: smile)
   - Example (top-only): "Return image exactly as is: replace eye direction to looking left, maintaining the exact same framing showing only top of face." (Action: replace, Object: eye direction, Attribute: looking left)

4. OPTIONAL ENHANCEMENTS (for both formats):
   - Realism context if image suggests casual phone photo style
   - Camera: "taken on an older smartphone", "front camera selfie"
   - Lighting: "flat indoor lighting", "slightly underexposed"
   - Imperfections: "slight digital noise", "front-camera softness"

EXAMPLES (Simple Format - for fully visible faces, showing Action + Object + Attribute):
✅ "Take the woman with a white tank top and replace her gaze direction to looking left, keeping everything else the exact same." (Action: replace, Object: gaze direction, Attribute: looking left)
✅ "Take the person in the pink room and modify their expression to smile, keeping everything else the exact same." (Action: modify, Object: expression, Attribute: smile)
✅ "Take the woman looking at camera and change her pose to slight head turn in a casual phone snapshot style with flat indoor lighting, keeping everything else the exact same." (Action: change, Object: pose, Attribute: slight head turn)
${imagesCount > 1 ? `✅ "Take the character from Image 1 and modify their expression to smile, using the style from Image 2, keeping everything else the exact same." (Multi-image: specifies roles)` : ''}

EXAMPLES (Complex Format - for partial faces, off-frame, showing Action + Object + Attribute):
✅ "Return image exactly as is: modify expression to smile, maintaining the exact same framing showing only bottom of face." (bottom-only: Action: modify, Object: expression, Attribute: smile)
✅ "Return image exactly as is: change mouth expression slightly, maintaining the exact same framing showing only bottom of face." (bottom-only: Action: change, Object: mouth expression, Attribute: slightly)
✅ "Return image exactly as is: replace eye direction to looking left, maintaining the exact same framing showing only top of face." (top-only: Action: replace, Object: eye direction, Attribute: looking left)
✅ "Return image exactly as is: modify expression to smile, maintaining the exact same framing with face partially off-frame." (if mouth visible: Action: modify, Object: expression, Attribute: smile)
✅ "Return image exactly as is: change pose slightly, maintaining the exact same casual off-frame snapshot composition." (Action: change, Object: pose, Attribute: slightly)
❌ BAD: "Return image exactly as is: replace eye direction to looking left, maintaining the exact same framing showing only bottom of face." (eyes not visible, cannot change eye direction)

REALISM CONTEXT (optional):
If the image appears to be a casual, unedited phone photo, you may naturally incorporate:
- Camera context: "taken on an older smartphone", "mid-range Android phone camera"
- Lighting quality: "flat dull indoor lighting", "slightly underexposed"
- Natural imperfections: "slight digital noise", "a touch of front-camera softness"
- Anti-studio: "avoiding studio lighting", "no cinematic look"
Keep these brief and integrated into the action description.

NATIVE LANGUAGE HANDLING (Seedream 4.0 Principle):
- For professional or cultural terms, use original language when appropriate
- Style terms: Use native language (e.g., "chiaroscuro" for Italian lighting style)
- Technical terms: Prefer English for consistency (e.g., "high-resolution", "depth of field")
- Cultural references: Use original language for accuracy
- Keep prompts primarily in English, but preserve important native terms

RULES:
- 15-35 words (can be slightly longer for complex format)
- One sentence only
- DEFAULT to SIMPLE format - only use complex format when face is OBVIOUSLY partially visible/off-frame
- When in doubt about face visibility, use SIMPLE format
- NEVER describe facial features, skin tone, or ethnicity
- For complex images (only when obvious): use "Return image exactly as is:" format
- For simple images (default): use "Take [reference] and [action]" format
- Never describe or assume features that aren't visible
- Maintain the exact same framing in the variant
- Realism details are optional - only if naturally fitting

OUTPUT: One sentence only.`
}

/**
 * Build system prompt for variant prompt enhancement
 * Enhanced with Seedream 4.0 low-effort realism strategies
 */
function buildVariantEnhanceSystemPrompt(): string {
  return `Add the user's requested change to the existing prompt using Seedream 4.0 editing strategies.

FORMAT: "Take [relative reference] and [original action] [new action], keeping everything else the exact same."

SEEDREAM 4.0 LOW-EFFORT REALISM STRATEGIES:
Seedream 4.0 responds well to camera type/context, lighting/dynamic range, and image editing phrasing.

BASE PATTERN (for realism requests):
"Keep the person's face, body, and clothing exactly the same as the original. Turn this into a [STYLE] photo: [CAMERA/CONTEXT] with [LIGHTING] and [FAULTS/IMPERFECTIONS]. Avoid studio lighting, avoid ultra-HD or beauty filters."

REALISTIC IPHONE SNAPSHOT EXAMPLES (Use these exact patterns for degradation requests):

GENERIC LOW-EFFORT (1-5):
1. "shot on an older iPhone in a small bedroom, flat overhead ceiling light, slightly underexposed, soft focus with hint of motion blur, faint grain and phone camera noise, no studio lighting, no depth-of-field effect, looks like an everyday unedited phone snapshot"

2. "casual iPhone photo, auto-exposure struggling with mixed warm indoor lights and cool daylight from window, shadows under eyes, slight overexposure on skin highlights, subtle digital noise, no professional lighting, looks like a quick photo a friend took, not a photoshoot"

3. "captured with an iPhone front camera, arm's-length distance, slightly distorted wide-angle perspective, soft detail on skin, mild smoothing from phone processing, tiny bit of motion blur, default camera app look, no studio sharpness or cinematic feel"

4. "realistic smartphone photo at high ISO, visible fine grain in darker areas, touch of colour noise, slightly muddy shadows, gentle JPEG compression artifacts around edges, ordinary 12-megapixel phone resolution, not ultra-sharp or 4K"

5. "unremarkable iPhone snapshot with awkward framing, subject slightly off-center, touch of motion blur from moving phone, mildly blown highlights on brightest areas, everyday camera-roll quality, looks like it was taken quickly without careful setup"

DIM / LOW-LIGHT (6-10):
6. "low-light iPhone photo in a dim bedroom, only bedside lamp on, soft yellow light, visible noise in background, slightly soft details, no dramatic contrast, realistic handheld phone shot at night, no pro lighting"

7. "iPhone mirror selfie in a clothing changing room, harsh overhead fluorescent light, slight green cast, grainy midtones, soft edges around model, mirror smudges faintly visible, looks like a quick try-on photo for friends"

8. "casual night-time iPhone photo under orange streetlights, uneven lighting across face, some areas in shadow, slight motion blur from slow shutter, visible noise in sky and background, looks like a real late-night phone snap, not a polished night portrait mode"

9. "realistic smartphone shot with strong backlight from window, subject a little underexposed, details in face slightly muddy, background mildly blown out, subtle lens flare streaks, overall soft contrast, like a quick phone pic taken against the light"

10. "handheld iPhone photo in a bar, mixed neon and warm lighting, slight colour shift on skin, grainy dark corners, small motion blur from dancing or moving, no clean studio edges, looks like a social photo from a night out"

COMPOSITION FLAWS (11-15):
11. "simple vertical iPhone portrait, everyday camera-roll quality, medium sharpness but not hyper-detailed, slightly crooked horizon, cluttered background still in focus, no bokeh, no cinematic look, feels like a casual friend photo rather than a photoshoot"

12. "standard iPhone camera processing with light over-sharpening on edges, slight halo around hair and clothing, textures not ultra-fine, small amount of HDR look in sky and shadows, typical modern phone photo rather than professional lens rendering"

13. "realistic smartphone photo taken with slightly smudged lens, very subtle hazy glow over bright areas, reduced micro-contrast, softer detail around highlights, no crisp studio lighting, gives impression of a real, imperfect phone camera"

14. "quick iPhone hallway snapshot, subject mid-step, little motion blur in hands or legs, uneven indoor lighting, background objects in full focus, mild noise, overall feel of an unplanned photo rather than a staged shoot"

15. "low-effort iPhone photo, casual pose, slightly awkward crop cutting off parts of body, plain indoor lighting with no dramatic shadows, moderate grain, normal phone dynamic range with some clipped whites and crushed blacks, looks like something sent over WhatsApp, not an advert"

HOW TO USE THESE EXAMPLES:
- When user requests "degradation", "low-quality", "phone camera", "casual snapshot", select the most appropriate example pattern
- Combine camera context + lighting + imperfections from examples
- Always end with "avoiding studio lighting, avoiding ultra-HD or beauty filters"
- Remove any quality-enhancing terms from the prompt before adding degradation
- Use exact phrasing from examples for best results

REUSABLE STYLE FRAGMENTS (mix & match):
A. Low effort / non-pro vibes:
- "look like an unedited phone snapshot, not a professional shoot"
- "casual, low-effort vibe, like a quick selfie taken for a friend"
- "no cinematic look, no color grading, no studio polish"
- "avoid ultra realistic 4K aesthetics, prefer a normal phone photo feel"

B. Camera & lens:
- "taken on an older smartphone, front camera, default settings"
- "mid-range Android phone camera, slightly soft lens"
- "handheld phone photo, no tripod, tiny bit of camera shake"

C. Lighting & exposure:
- For quality improvements: "balanced exposure", "even ambient lighting with balanced exposure"
- For casual/low-quality: "flat indoor lighting", "dull indoor lighting", "mixed indoor lighting", "harsh overhead light"
- For professional: "soft directional illumination", "balanced exposure"
- Use "balanced exposure" only when maintaining quality - omit for casual/degradation effects

D. Blur / focus / motion:
- "very slight motion blur from hand shake, but face still mostly readable"
- "a touch of front-camera softness, not perfectly sharp"
- "focus not perfect: face is a little soft, background not fully blurred"
- "no bokeh, everything at similar focus level, like a cheap phone sensor"

E. Noise, grain, compression:
- "visible digital noise in the darker areas"
- "light high-ISO grain, like a photo taken at night indoors"
- "subtle JPEG compression artifacts, not crystal clear"
- "a hint of social-media compression, not ultra crisp"

SPECIAL HANDLING FOR SPECIFIC REQUEST TYPES:

F. Jewelry removal:
- For jewelry removal: explicitly state "remove [jewelry type]" or "remove all jewelry" in the action
- Ensure jewelry removal doesn't affect clothing or other accessories
- Format: "Remove [jewelry type] from subject, keeping everything else the exact same"
- Examples: "Remove all jewelry including necklaces, earrings, rings, bracelets, and watches, keeping everything else the exact same"
- Be specific: "Remove necklaces and neck jewelry" or "Remove earrings" or "Remove rings"

G. Clothing color changes:
- For color changes: specify "change clothing color to [color]" or "change [garment] color to [color]"
- Maintain all other clothing details (style, texture, fit) when changing color
- Format: "Change clothing color to [color], keeping everything else the exact same"
- Examples: "Change clothing color to red, keeping everything else the exact same"
- Preserve all other clothing attributes (fabric type, cut, style, accessories)

H. Composition and framing optimizations:
- For composition changes: modify the Camera section with specific framing details
- For casual/realism: combine Camera, Lighting, and Technical quality sections
- Use Seedream 4.0 structured format: update relevant sections (Camera:, Composition:, Technical quality:)
- For off-center: "Apply off-center composition with subject positioned using rule of thirds, asymmetric framing, informal camera placement"
- For casual snap: "Turn this into a casual snapshot: candid composition with off-center framing, handheld phone camera perspective, flat indoor lighting, avoiding studio polish"
- For partial face crops: "Apply close-up crop showing only [top/bottom/left/right] half of face, maintaining exact framing and preserving detail quality"

I. Lighting quality strategies:
- For quality improvements: use "balanced exposure" to prevent degradation
- For casual/low-quality: use "flat indoor lighting", "dull lighting", or specific camera-based lighting
- For degradation effects: omit "balanced exposure" to allow natural quality reduction
- Use negative prompts: "avoiding studio lighting", "avoiding ultra-HD filters"

DEGRADATION DETECTION & CONFLICT REMOVAL:
Before enhancing, check if user request is for degradation/low-quality:
- Keywords: "degradation", "low-quality", "phone camera", "casual snapshot", "unedited", "amateur", "low-effort", "realistic phone photo", "iPhone", "smartphone", "phone snapshot", "camera-roll", "everyday", "quick photo", "friend took", "not a photoshoot", "no studio", "no professional", "flat lighting", "dull lighting"
- Preset categories: degradation, lighting_degradation, quality (casual snapshot)

IF degradation detected:
1. Remove quality-enhancing terms from existing prompt:
   - Remove: "8K", "ultra detailed", "studio lighting", "cinematic", "balanced exposure", "professional quality"
   - Remove: "high resolution", "crystal clear", "perfectly sharp", "tack sharp", "ultra realistic", "4K", "hyper-detailed", "beauty filters", "ultra-HD filters", "studio polish", "professional shoot"
2. Use degradation patterns from iPhone snapshot examples above
3. Always add: "avoiding studio lighting, avoiding ultra-HD or beauty filters"
4. Use specific camera/lighting/imperfection combinations from examples

IF quality improvement detected:
1. Keep or add "balanced exposure" for lighting improvements
2. Use professional quality terms appropriately
3. Maintain existing quality level or enhance it

HOW TO ADD:
- Keep the existing relative reference unchanged
- Keep the existing action
- Add the new action from user's request (can include camera/lighting/realism details)
- For jewelry removal: use explicit removal language
- For color changes: specify color while preserving other clothing details
- For composition: integrate into Camera/Composition/Technical quality sections appropriately
- Always end with "keeping everything else the exact same"

EXAMPLES:
- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "make lighting more dramatic"
  Result: "Take the woman with a white tank top and return her looking to the left with more dramatic lighting, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "make it look like a casual phone snapshot"
  Result: "Take the person in the pink room and make them smile, turn this into a casual phone snapshot: taken on an older smartphone with flat indoor lighting and slight digital noise, avoiding studio lighting and ultra-HD filters, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "add low-effort realism with phone camera feel"
  Result: "Take the woman with a white tank top and return her looking to the left, turn this into a casual phone photo: front camera smartphone selfie with slightly underexposed lighting and a touch of front-camera softness, avoiding studio polish, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "make it look like a low-effort iPhone snapshot"
  Result: "Take the woman with a white tank top and return her looking to the left, turn this into a shot on an older iPhone in a small bedroom: flat overhead ceiling light, slightly underexposed, soft focus with hint of motion blur, faint grain and phone camera noise, no studio lighting, no depth-of-field effect, looks like an everyday unedited phone snapshot, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "add dim bedroom lighting with phone camera feel"
  Result: "Take the person in the pink room and make them smile, turn this into a low-light iPhone photo in a dim bedroom: only bedside lamp on, soft yellow light, visible noise in background, slightly soft details, no dramatic contrast, realistic handheld phone shot at night, no pro lighting, keeping everything else the exact same"

RULES:
- Keep existing relative reference
- Add new action to existing actions
- For realism requests, use camera/lighting/imperfection fragments
- 15-35 words total (can be slightly longer for realism details)
- End with "keeping everything else the exact same"
- NEVER describe facial features, skin tone, or ethnicity

OUTPUT: One sentence only.`
}

/**
 * Build user message for variant prompt enhancement
 * Enhanced with Seedream 4.0 realism examples
 */
function buildVariantEnhanceUserText(existingPrompt: string, userInstructions: string, isDegradation: boolean = false): string {
  const hasExistingPrompt = existingPrompt && existingPrompt.trim().length > 0
  
  if (!hasExistingPrompt) {
    // Generate new prompt from instructions
    return `USER'S REQUEST:
"${userInstructions}"

TASK: Generate a new variant prompt based on the user's request using Seedream 4.0 principles.
${isDegradation ? '\nIMPORTANT: This is a degradation/low-quality request. Use degradation patterns from iPhone snapshot examples.' : ''}

HOW:
1. Create a relative reference (e.g., "the woman with...", "the person in...")
2. Incorporate the user's request as the main action
   - For realism requests: use camera/context, lighting, and imperfection fragments
   - For style requests: incorporate appropriate style fragments
3. End with "keeping everything else the exact same"

SEEDREAM 4.0 REALISM STRATEGY:
When user requests "low-effort", "phone camera", "casual snapshot", or similar realism:
- Use base pattern: "Turn this into a [STYLE] photo: [CAMERA/CONTEXT] with [LIGHTING]"
- Focus on camera type (older smartphone, front camera) and lower-quality lighting (flat indoor lighting)
- Always add "avoiding studio lighting, avoiding ultra-HD or beauty filters"
- For quality-lowering: use "flat indoor lighting" or "dull lighting" instead of "balanced exposure"
- For quality-maintaining: use "balanced exposure"

DEGRADATION DETECTION & CONFLICT REMOVAL:
${isDegradation ? '⚠️ DEGRADATION REQUEST DETECTED - Use degradation patterns from iPhone snapshot examples.\n' : ''}
Check if user request is for degradation/low-quality:
- Keywords: "degradation", "low-quality", "phone camera", "casual snapshot", "unedited", "amateur", "low-effort", "realistic phone photo", "iPhone", "smartphone", "phone snapshot", "camera-roll", "everyday", "quick photo", "friend took", "not a photoshoot", "no studio", "no professional", "flat lighting", "dull lighting"
- Preset categories: degradation, lighting_degradation, quality (casual snapshot)

IF degradation detected:
1. Use degradation patterns from iPhone snapshot examples in system prompt
2. Always add: "avoiding studio lighting, avoiding ultra-HD or beauty filters"
3. Use specific camera/lighting/imperfection combinations from examples
4. Do NOT add "balanced exposure" or any quality-enhancing terms

IF quality improvement detected:
1. Add "balanced exposure" for lighting improvements
2. Use professional quality terms appropriately

JEWELRY REMOVAL STRATEGY:
When user requests jewelry removal:
- Explicitly state "remove [jewelry type]" or "remove all jewelry"
- Ensure removal doesn't affect clothing or other accessories
- Format: "Remove [jewelry type] from subject, keeping everything else the exact same"

CLOTHING COLOR CHANGE STRATEGY:
When user requests clothing color change:
- Specify "change clothing color to [color]" while preserving all other clothing details
- Maintain style, texture, fit, and other attributes
- Format: "Change clothing color to [color], keeping everything else the exact same"

COMPOSITION OPTIMIZATION STRATEGY:
When user requests composition changes (off-center, casual snap, partial face):
- For off-center: integrate into Camera section with specific framing details
- For casual snap: combine Camera and Lighting with balanced exposure
- For partial face crops: specify which part (top/bottom/left/right)
- Use Seedream 4.0 structured format appropriately
- Format: "Apply [composition type] with [specific details], maintaining exact framing, keeping everything else the exact same"

RULES:
- Create a relative reference (the woman with..., the person in...)
- Incorporate user's request as the main action
- For realism: use camera/lighting/imperfection fragments appropriately
- 15-35 words total (can be slightly longer for realism details)
- End with "keeping everything else the exact same"
- NEVER describe facial features, skin tone, or ethnicity

OUTPUT: One sentence only.`
  }
  
  // Enhance existing prompt
  return `EXISTING PROMPT:
"${existingPrompt}"

USER'S REQUEST:
"${userInstructions}"

TASK: Add the user's request to the existing prompt using Seedream 4.0 editing strategies.
${isDegradation ? '\nIMPORTANT: This is a degradation/low-quality request. The existing prompt has been cleaned of quality-enhancing terms. Use degradation patterns from iPhone snapshot examples.' : ''}

HOW:
1. Keep the existing relative reference (the woman with..., the person in...)
2. Keep the existing action(s)
3. Add the new action from user's request
   - For realism requests: use camera/context, lighting, and imperfection fragments
   - For style requests: incorporate appropriate style fragments
4. Keep "keeping everything else the exact same" at the end

SEEDREAM 4.0 REALISM STRATEGY:
When user requests "low-effort", "phone camera", "casual snapshot", or similar realism:
- Use base pattern: "Turn this into a [STYLE] photo: [CAMERA/CONTEXT] with [LIGHTING]"
- Focus on camera type (older smartphone, front camera) and lower-quality lighting (flat indoor lighting)
- Always add "avoiding studio lighting, avoiding ultra-HD or beauty filters"
- For quality-lowering: use "flat indoor lighting" or "dull lighting" instead of "balanced exposure"
- For quality-maintaining: use "balanced exposure"

DEGRADATION DETECTION & CONFLICT REMOVAL:
${isDegradation ? '⚠️ DEGRADATION REQUEST DETECTED - The existing prompt has been cleaned of quality-enhancing terms.\n' : ''}
Check if user request is for degradation/low-quality:
- Keywords: "degradation", "low-quality", "phone camera", "casual snapshot", "unedited", "amateur", "low-effort", "realistic phone photo", "iPhone", "smartphone", "phone snapshot", "camera-roll", "everyday", "quick photo", "friend took", "not a photoshoot", "no studio", "no professional", "flat lighting", "dull lighting"
- Preset categories: degradation, lighting_degradation, quality (casual snapshot)

IF degradation detected:
1. The existing prompt has been cleaned of quality-enhancing terms (if not already done)
2. Use degradation patterns from iPhone snapshot examples in system prompt
3. Always add: "avoiding studio lighting, avoiding ultra-HD or beauty filters"
4. Use specific camera/lighting/imperfection combinations from examples
5. Do NOT add "balanced exposure" or any quality-enhancing terms

IF quality improvement detected:
1. Keep or add "balanced exposure" for lighting improvements
2. Use professional quality terms appropriately
3. Maintain existing quality level or enhance it

JEWELRY REMOVAL STRATEGY:
When user requests jewelry removal:
- Explicitly state "remove [jewelry type]" or "remove all jewelry"
- Ensure removal doesn't affect clothing or other accessories
- Format: "Remove [jewelry type] from subject, keeping everything else the exact same"

CLOTHING COLOR CHANGE STRATEGY:
When user requests clothing color change:
- Specify "change clothing color to [color]" while preserving all other clothing details
- Maintain style, texture, fit, and other attributes
- Format: "Change clothing color to [color], keeping everything else the exact same"

COMPOSITION OPTIMIZATION STRATEGY:
When user requests composition changes (off-center, casual snap, partial face):
- For off-center: integrate into Camera section with specific framing details
- For casual snap: combine Camera and Lighting with balanced exposure
- For partial face crops: specify which part (top/bottom/left/right)
- Use Seedream 4.0 structured format appropriately
- Format: "Apply [composition type] with [specific details], maintaining exact framing, keeping everything else the exact same"

EXAMPLES:
- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "make lighting more dramatic"
  Result: "Take the woman with a white tank top and return her looking to the left with more dramatic lighting, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "make it look like a casual phone snapshot"
  Result: "Take the person in the pink room and make them smile, turn this into a casual phone snapshot: taken on an older smartphone with flat indoor lighting, avoiding studio lighting and ultra-HD filters, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "add low-effort realism with phone camera feel"
  Result: "Take the woman with a white tank top and return her looking to the left, turn this into a casual phone photo: front camera smartphone selfie with flat indoor lighting, avoiding studio polish, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "make it look like an unedited phone photo"
  Result: "Take the person in the pink room and make them smile, turn this into an unedited phone snapshot: mid-range Android phone camera with flat indoor lighting, no cinematic look, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "add motion blur and grain"
  Result: "Take the woman with a white tank top and return her looking to the left with very slight motion blur from hand shake and light high-ISO grain, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "make it look like a low-effort iPhone snapshot"
  Result: "Take the woman with a white tank top and return her looking to the left, turn this into a shot on an older iPhone in a small bedroom: flat overhead ceiling light, slightly underexposed, soft focus with hint of motion blur, faint grain and phone camera noise, no studio lighting, no depth-of-field effect, looks like an everyday unedited phone snapshot, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "add dim bedroom lighting with phone camera feel"
  Result: "Take the person in the pink room and make them smile, turn this into a low-light iPhone photo in a dim bedroom: only bedside lamp on, soft yellow light, visible noise in background, slightly soft details, no dramatic contrast, realistic handheld phone shot at night, no pro lighting, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "remove all jewelry"
  Result: "Take the person in the pink room and make them smile, remove all jewelry including necklaces, earrings, rings, bracelets, and watches, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "remove earrings"
  Result: "Take the woman with a white tank top and return her looking to the left, remove earrings, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "change clothing color to red"
  Result: "Take the person in the pink room and make them smile, change clothing color to red, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "change clothing color to navy"
  Result: "Take the woman with a white tank top and return her looking to the left, change clothing color to navy, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "apply off-center composition with subject positioned using rule of thirds, asymmetric framing, informal camera placement"
  Result: "Take the person in the pink room and make them smile, apply off-center composition with subject positioned using rule of thirds, asymmetric framing, informal camera placement, keeping everything else the exact same"

- Original: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"
  User: "turn this into a casual snapshot: candid composition with off-center framing, handheld phone camera perspective, avoiding studio polish"
  Result: "Take the woman with a white tank top and return her looking to the left, turn this into a casual snapshot: candid composition with off-center framing, handheld phone camera perspective, flat indoor lighting, avoiding studio polish, keeping everything else the exact same"

- Original: "Take the person in the pink room and make them smile, keeping everything else the exact same"
  User: "apply close-up crop showing only bottom half of face"
  Result: "Take the person in the pink room and make them smile, apply close-up crop showing only bottom half of face (mouth and chin visible), maintaining exact framing, keeping everything else the exact same"

RULES:
- Keep existing relative reference unchanged
- Add new action to existing actions
- For realism: use camera/lighting/imperfection fragments appropriately
- 15-35 words total (can be slightly longer for realism details)
- End with "keeping everything else the exact same"
- NEVER describe facial features, skin tone, or ethnicity

OUTPUT: One sentence only.`
}


/**
 * Remove quality-enhancing terms from prompt when degradation is requested
 */
function removeQualityConflicts(prompt: string, isDegradation: boolean): string {
  if (!isDegradation) return prompt
  
  const qualityTerms = [
    '8K', 'ultra detailed', 'ultra-detailed', 'ultra HD', 'ultra-HD',
    'studio lighting', 'cinematic', 'cinematic lighting', 'professional',
    'high resolution', 'crystal clear', 'perfectly sharp', 'tack sharp',
    'balanced exposure', 'even lighting', 'professional quality',
    'ultra realistic', '4K', 'hyper-detailed', 'beauty filters',
    'ultra-HD filters', 'studio polish', 'professional shoot'
  ]
  
  let cleaned = prompt
  qualityTerms.forEach(term => {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    cleaned = cleaned.replace(regex, '')
  })
  
  // Clean up extra spaces and punctuation artifacts
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  cleaned = cleaned.replace(/\s*,\s*,/g, ',') // Remove double commas
  cleaned = cleaned.replace(/\s*\.\s*\./g, '.') // Remove double periods
  
  return cleaned
}

/**
 * Detect if user instructions request degradation/low-quality effects
 */
function isDegradationRequest(userInstructions: string): boolean {
  const degradationKeywords = [
    'degradation', 'low-quality', 'phone camera', 'casual snapshot',
    'unedited', 'amateur', 'low-effort', 'realistic phone photo',
    'iPhone', 'smartphone', 'phone snapshot', 'camera-roll',
    'everyday', 'quick photo', 'friend took', 'not a photoshoot',
    'no studio', 'no professional', 'flat lighting', 'dull lighting'
  ]
  
  const lowerInstructions = userInstructions.toLowerCase()
  return degradationKeywords.some(keyword => lowerInstructions.includes(keyword))
}

/**
 * Validate variant prompts - simplified to only essential checks
 */
function validateVariantPrompt(generatedPrompt: string, model: string): void {
  // Basic sanity check - must not be empty
  if (!generatedPrompt || generatedPrompt.trim().length < 5) {
    console.log(`${model} rejected: empty or too short`)
    throw new Error('Generated prompt is too brief')
  }
  
  // Check for forbidden meta-commentary and markdown (formatting issues)
  const metaPattern = /\b(here's|here is|i've|note:|below is|let me know|if you need|generated via)\b/i
  const markdownPattern = /(\*\*|###|##|!\[|\]\(|```)/
  
  if (metaPattern.test(generatedPrompt) || markdownPattern.test(generatedPrompt)) {
    console.log(`${model} rejected: contains meta-commentary or markdown`)
    throw new Error('Generated prompt must not contain meta-commentary or markdown formatting')
  }
  
  // Safety check - forbidden content
  const unsafePattern = /\b(nude|naked|topless|explicit|sexual|nsfw)\b/i
  if (unsafePattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected due to unsafe content`)
    throw new Error('Generated prompt contains unsafe content')
  }
  
  // Safety check - forbidden facial/ethnic descriptors
  const forbiddenPattern = /\b(eye color|eyes are|blue eyes|brown eyes|green eyes|nose shape|mouth shape|facial features|skin tone|skin color|pale skin|dark skin|fair skin|ethnicity|ethnic|caucasian|asian|african|hispanic)\b/i
  if (forbiddenPattern.test(generatedPrompt.toLowerCase())) {
    console.log(`${model} rejected: contains forbidden facial/ethnic descriptors`)
    throw new Error('Generated prompt must not describe facial features, skin tone, or ethnicity')
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
  const errors: Array<{ model: string; error: string }> = []
  for (const model of GROK_MODELS) {
    try {
      return await generateVariantPromptWithModel(model, imageUrls, apiKey)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push({ model, error: errorMessage })
      console.warn(`Model ${model} failed for variant generation, trying next model:`, {
        model,
        imagesCount: imageUrls.length,
        promptStyle: 'variant',
        error: errorMessage
      })
      if (model === GROK_MODELS[GROK_MODELS.length - 1]) {
        console.error('All models failed for variant generation', {
          imagesCount: imageUrls.length,
          promptStyle: 'variant',
          errors: errors.map(e => `${e.model}: ${e.error}`)
        })
        throw new Error(`All Grok models failed to generate variant prompt. Errors: ${errors.map(e => `${e.model}: ${e.error}`).join('; ')}`)
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

  // Use simplified variant templates
  const systemPrompt = buildVariantSystemPrompt(imageUrls.length)
  const userText = buildVariantUserText(imageUrls.length)

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
        promptStyle: 'variant',
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
    const errorContext = {
      model,
      status: response.status,
      statusText: response.statusText,
        promptStyle: 'variant',
      imagesCount: imageUrls.length,
      error: errorText
    }
    console.error(`${model} variant generation API error:`, errorContext)
    throw new Error(`Variant generation failed with ${model}: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data: GrokVisionResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    const errorContext = {
      model,
        promptStyle: 'variant',
      imagesCount: imageUrls.length,
      responseData: data
    }
    console.error(`${model} variant generation: no choices in response`, errorContext)
    throw new Error(`Variant generation failed: ${model} returned no response choices`)
  }

  const generatedPrompt = data.choices[0].message.content.trim()
  
  if (!generatedPrompt) {
    const errorContext = {
      model,
        promptStyle: 'variant',
      imagesCount: imageUrls.length
    }
    console.error(`${model} variant generation: empty prompt`, errorContext)
    throw new Error(`Variant generation failed: ${model} returned empty prompt`)
  }

  // Validate variant prompt
  try {
    validateVariantPrompt(generatedPrompt, model)
  } catch (validationError) {
    const errorContext = {
      model,
      promptStyle: 'variant',
      imagesCount: imageUrls.length,
      promptLength: generatedPrompt.length,
      wordCount: generatedPrompt.split(/\s+/).length,
      validationError: validationError instanceof Error ? validationError.message : String(validationError)
    }
    console.error(`${model} variant generation: validation failed`, errorContext)
    throw new Error(`Variant prompt validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`)
  }

  console.log(`${model} variant prompt generated:`, {
    promptStyle: 'variant',
    promptLength: generatedPrompt.length,
    wordCount: generatedPrompt.split(/\s+/).length
  })

  return generatedPrompt
}

/**
 * Enhance variant prompt with user instructions
 * For text-only enhancements (presets), images are not needed and will speed up the request
 */
export async function enhanceVariantPromptWithGrok(
  existingPrompt: string,
  userInstructions: string,
  imageUrls?: string[]
): Promise<string> {
  const hasImages = imageUrls && imageUrls.length > 0
  const hasExistingPrompt = existingPrompt && existingPrompt.trim().length > 0
  
  // Detect if this is a degradation request
  const isDegradation = isDegradationRequest(userInstructions)
  
  // Remove quality conflicts from existing prompt if degradation is requested
  // Skip cleaning if there's no existing prompt (we're generating new)
  const cleanedPrompt = hasExistingPrompt && isDegradation
    ? removeQualityConflicts(existingPrompt, true)
    : existingPrompt || ''
  
  console.log('[enhanceVariantPromptWithGrok] Entry point:', {
    existingPromptLength: existingPrompt.length,
    cleanedPromptLength: cleanedPrompt.length,
    instructionsLength: userInstructions.length,
    imageUrlsCount: imageUrls?.length || 0,
    hasImages,
    hasExistingPrompt,
    isDegradation,
    isNewPrompt: !hasExistingPrompt,
    promptStyle: 'variant',
    mode: hasImages ? 'with-images' : 'text-only'
  })

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Use simplified variant enhancement templates
  const systemPrompt = buildVariantEnhanceSystemPrompt()
  const userText = buildVariantEnhanceUserText(cleanedPrompt, userInstructions, isDegradation)

  // Build user message content - only include images if provided
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  // Only add images if provided (skip for text-only enhancements like presets)
  if (hasImages) {
    imageUrls!.forEach((url) => {
      userContent.push({
        type: 'image_url',
        image_url: { url }
      })
    })
  }

  // Estimate instruction complexity for adaptive sampling
  const complexity = estimateInstructionComplexity(userInstructions)

  // Try each model until one succeeds
  const errors: Array<{ model: string; error: string }> = []
  for (const model of GROK_MODELS) {
    try {
      return await enhanceVariantPromptWithModel(
        model, 
        systemPrompt, 
        userContent, 
        apiKey,
        imageUrls?.length || 0,
        complexity,
        isDegradation
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push({ model, error: errorMessage })
      console.warn(`Model ${model} variant enhancement failed, trying next model:`, {
        model,
        imagesCount: imageUrls?.length || 0,
        promptStyle: 'variant',
        instructionComplexity: complexity,
        error: errorMessage
      })
    }
  }

  console.error('All models failed for variant enhancement', {
    imagesCount: imageUrls?.length || 0,
        promptStyle: 'variant',
    instructionComplexity: complexity,
    errors: errors.map(e => `${e.model}: ${e.error}`)
  })
  throw new Error(`All Grok models failed to enhance variant prompt. Errors: ${errors.map(e => `${e.model}: ${e.error}`).join('; ')}`)
}

/**
 * Improve a variant prompt automatically using Grok with Seedream 4.0 guidance
 * Analyzes both the prompt structure and the actual images to optimize the prompt
 */
export async function improveVariantPromptWithGrok(
  existingPrompt: string,
  imageUrls?: string[]
): Promise<string> {
  const hasImages = imageUrls && imageUrls.length > 0
  
  console.log('[improveVariantPromptWithGrok] Entry point:', {
    existingPromptLength: existingPrompt.length,
    imageUrlsCount: imageUrls?.length || 0,
    hasImages,
    promptStyle: 'variant',
    mode: hasImages ? 'with-images' : 'text-only'
  })

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Use variant improve templates
  const systemPrompt = buildVariantImproveSystemPrompt()
  const userText = buildVariantImproveUserText(existingPrompt)

  // Build user message content - include images if provided
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  // Add images if provided for visual context
  if (hasImages) {
    imageUrls!.forEach((url) => {
      userContent.push({
        type: 'image_url',
        image_url: { url }
      })
    })
  }

  // Try each model until one succeeds
  const errors: Array<{ model: string; error: string }> = []
  for (const model of GROK_MODELS) {
    try {
      return await improveVariantPromptWithModel(
        model, 
        systemPrompt, 
        userContent, 
        apiKey,
        imageUrls?.length || 0
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push({ model, error: errorMessage })
      console.warn(`Model ${model} variant improvement failed, trying next model:`, {
        model,
        imagesCount: imageUrls?.length || 0,
        promptStyle: 'variant',
        error: errorMessage
      })
    }
  }

  console.error('All models failed for variant improvement', {
    imagesCount: imageUrls?.length || 0,
    promptStyle: 'variant',
    errors: errors.map(e => `${e.model}: ${e.error}`)
  })
  throw new Error(`All Grok models failed to improve variant prompt. Errors: ${errors.map(e => `${e.model}: ${e.error}`).join('; ')}`)
}

async function improveVariantPromptWithModel(
  model: string,
  systemPrompt: string,
  userContent: GrokVisionContent[],
  apiKey: string,
  imagesCount: number
): Promise<string> {
  // For requests with images, we need vision-capable models
  if (imagesCount > 0) {
    const isVisionModel = model.includes('vision') || 
                         ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

    if (!isVisionModel) {
      throw new Error(`Model ${model} does not support vision capabilities`)
    }
  }

  // Newer models don't support presence_penalty or frequency_penalty
  const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  // Seedream v4 parameters optimized for prompt improvement
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.45, // Lower for more consistent optimization
    max_tokens: 500,  // Sufficient for variant prompt improvement
    top_p: 0.9
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = 0.3
    requestBody.presence_penalty = 0.2
  }

  console.log(`${model} sending improvement request to Grok:`, {
    promptStyle: 'seedream-4.0',
    operationType: 'variant-improvement',
    maxTokens: requestBody.max_tokens,
    temperature: requestBody.temperature,
    hasImages: imagesCount > 0,
    imagesCount
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

  const improvedPrompt = data.choices[0].message.content.trim()
  
  if (!improvedPrompt) {
    throw new Error(`Empty prompt generated by ${model}`)
  }

  console.log(`${model} improved prompt:`, {
    prompt: improvedPrompt,
    promptLength: improvedPrompt.length,
    wordCount: improvedPrompt.split(/\s+/).length,
    imagesCount,
    promptStyle: 'seedream-4.0'
  })

  return improvedPrompt
}

/**
 * Build system prompt for variant prompt improvement
 * Guides Grok to optimize prompts based on Seedream 4.0 best practices
 */
function buildVariantImproveSystemPrompt(): string {
  return `You are an expert at optimizing Seedream 4.0 variant prompts.

YOUR TASK: Analyze and improve an existing variant prompt to better align with Seedream 4.0 best practices and accurately describe the images.

SEEDREAM 4.0 KEY PRINCIPLES:
1. **Natural Language Structure**: Combine subject + action + environment with concise style/color/lighting/composition keywords
2. **Specificity Over Abstraction**: Use concrete, detailed language - "crimson velvet evening gown" NOT "nice dress"
3. **Visible Elements Only**: Describe only what is actually visible in the images - no speculation
4. **Proper Format**: Use the variant prompt format: "Take [relative reference] and [action], keeping everything else the exact same"

VARIANT PROMPT FORMAT:
- Structure: "Take [relative reference] and [action], keeping everything else the exact same"
- Relative reference: "the woman with...", "the person in...", "the subject wearing..."
- Action: Specific editing instruction (pose change, expression, lighting, style, etc.)
- Always end with: "keeping everything else the exact same"

IMPROVEMENT GUIDELINES:
1. **Optimize Structure**: Ensure prompt follows proper variant format
2. **Enhance Specificity**: Replace vague terms with concrete, detailed descriptions
3. **Align with Images**: If images are provided, ensure prompt accurately describes what's visible
4. **Natural Language**: Ensure prompt flows naturally and reads well
5. **Maintain Intent**: Preserve the original intent while improving clarity and accuracy
6. **Seedream 4.0 Compliance**: Ensure prompt follows all Seedream 4.0 principles

WHAT TO IMPROVE:
- Make relative references more specific and descriptive
- Enhance action descriptions with concrete details
- Ensure prompt accurately reflects image content (if images provided)
- Improve natural language flow
- Add missing specificity where appropriate
- Fix any structural issues

CRITICAL RULES:
- NEVER describe facial features, skin tone, or ethnicity
- Keep prompt concise (15-35 words typically, can be slightly longer for complex actions)
- Maintain the "keeping everything else the exact same" ending
- Preserve the original intent and action
- Only describe what's visible in images (if provided)

OUTPUT: Improved variant prompt only. No markdown, no explanations, just the optimized prompt.`
}

/**
 * Build user message for variant prompt improvement
 * Includes current prompt and instructions to analyze and improve
 */
function buildVariantImproveUserText(existingPrompt: string): string {
  return `EXISTING PROMPT:
"${existingPrompt}"

YOUR TASK:
Analyze this prompt and improve it to better align with Seedream 4.0 best practices. Optimize both the structure and content.

IMPROVEMENT FOCUS:
1. **Structure Optimization**: Ensure proper variant prompt format
2. **Specificity Enhancement**: Replace vague terms with concrete, detailed language
3. **Image Alignment**: If images are provided, analyze them and ensure the prompt accurately describes what's visible
4. **Natural Language**: Improve flow and readability
5. **Seedream 4.0 Compliance**: Ensure all principles are followed

ANALYSIS STEPS:
1. Review the current prompt structure - does it follow the variant format?
2. Identify vague or abstract terms - replace with specific, concrete descriptions
3. If images are provided, compare prompt to actual image content - ensure accuracy
4. Check natural language flow - improve readability
5. Verify Seedream 4.0 compliance - ensure all principles are met

IMPROVEMENT EXAMPLES:

Example 1 - Enhancing Specificity:
Before: "Take the person and make them smile, keeping everything else the exact same"
After: "Take the person in the pink room and make them smile, keeping everything else the exact same"

Example 2 - Better Image Alignment:
Before: "Take the woman and return her looking to the left, keeping everything else the exact same"
After: "Take the woman with a white tank top and return her looking to the left, keeping everything else the exact same"

Example 3 - Adding Missing Details:
Before: "Take the person and change the lighting, keeping everything else the exact same"
After: "Take the person in the modern office and change the lighting to warm golden hour with balanced exposure, keeping everything else the exact same"

RULES:
- Keep the same relative reference structure (or improve it if too vague)
- Preserve the original action intent
- Enhance with specific, concrete details
- Ensure prompt accurately reflects images (if provided)
- Maintain "keeping everything else the exact same" ending
- 15-35 words typically (can be slightly longer for complex improvements)
- NEVER describe facial features, skin tone, or ethnicity

OUTPUT: Improved prompt only. One sentence. No markdown or explanations.`
}

async function enhanceVariantPromptWithModel(
  model: string,
  systemPrompt: string,
  userContent: GrokVisionContent[],
  apiKey: string,
  imagesCount: number,
  instructionComplexity: 'low' | 'medium' | 'high',
  isDegradation: boolean = false
): Promise<string> {
  // For text-only requests, we can use any model (vision models work fine with text-only)
  // For requests with images, we need vision-capable models
  if (imagesCount > 0) {
    const isVisionModel = model.includes('vision') || 
                         ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

    if (!isVisionModel) {
      throw new Error(`Model ${model} does not support vision capabilities`)
    }
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
        promptStyle: 'variant',
    imagesCount,
    hasImages: imagesCount > 0,
    mode: imagesCount > 0 ? 'with-images' : 'text-only',
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
    const errorContext = {
      model,
      status: response.status,
      statusText: response.statusText,
        promptStyle: 'variant',
      imagesCount,
      instructionComplexity,
      error: errorText
    }
    console.error(`${model} variant enhancement API error:`, errorContext)
    throw new Error(`Variant enhancement failed with ${model}: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data: GrokVisionResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    const errorContext = {
      model,
        promptStyle: 'variant',
      imagesCount,
      instructionComplexity,
      responseData: data
    }
    console.error(`${model} variant enhancement: no choices in response`, errorContext)
    throw new Error(`Variant enhancement failed: ${model} returned no response choices`)
  }

  let enhancedPrompt = data.choices[0].message.content.trim()
  
  if (!enhancedPrompt) {
    const errorContext = {
      model,
        promptStyle: 'variant',
      imagesCount,
      instructionComplexity
    }
    console.error(`${model} variant enhancement: empty prompt`, errorContext)
    throw new Error(`Variant enhancement failed: ${model} returned empty prompt`)
  }

  // Remove quality conflicts if this is a degradation request
  if (isDegradation) {
    const beforeClean = enhancedPrompt
    enhancedPrompt = removeQualityConflicts(enhancedPrompt, true)
    if (beforeClean !== enhancedPrompt) {
      console.log(`${model} removed quality conflicts from enhanced prompt:`, {
        beforeLength: beforeClean.length,
        afterLength: enhancedPrompt.length
      })
    }
  }

  // Validate variant prompt
  try {
    validateVariantPrompt(enhancedPrompt, model)
  } catch (validationError) {
    const errorContext = {
      model,
      promptStyle: 'variant',
      imagesCount,
      instructionComplexity,
      promptLength: enhancedPrompt.length,
      wordCount: enhancedPrompt.split(/\s+/).length,
      validationError: validationError instanceof Error ? validationError.message : String(validationError)
    }
    console.error(`${model} variant enhancement: validation failed`, errorContext)
    throw new Error(`Variant prompt validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`)
  }

  console.log(`${model} variant enhancement successful:`, {
        promptStyle: 'variant',
    enhancedLength: enhancedPrompt.length,
    wordCount: enhancedPrompt.split(/\s+/).length,
    isDegradation
  })

  return enhancedPrompt
}
