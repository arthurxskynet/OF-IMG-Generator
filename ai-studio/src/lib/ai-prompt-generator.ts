import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
const USE_LLM_FACESWAP = process.env.PROMPT_USE_LLM_FACESWAP !== 'false'
// Try different model names in order of preference (latest models first)
// Note: grok-2-image-1212 is an image generation model, not a chat model, so it's excluded
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212']
// Enable rich Seedream-style prompts - ALWAYS ENABLED for production quality
const USE_RICH_PROMPTS = true

export type SwapMode = 'face' | 'face-hair'

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
 * Build system prompt for Seedream 4.0 face-swap operations
 * Integrates official Seedream 4.0 prompting guide principles
 */
function buildSeedreamFaceSwapSystemPrompt(refCount: number, swapMode: SwapMode): string {
  const isFaceOnly = swapMode === 'face'
  const refDescription = refCount === 1 ? 'reference image' : `${refCount} reference images`
  
  return `You are an expert at creating production-ready Seedream 4.0 image generation prompts.

SEEDREAM 4.0 CONTEXT:
- Total images: ${refCount + 1} (${refCount} reference + 1 target)
- Image roles:
  ${refCount === 1 
    ? `  • Image 1: ${isFaceOnly ? 'Face structure reference (face only, not hair)' : 'Face and hair reference'}`
    : `  • Images 1-${refCount}: ${isFaceOnly ? 'Face structure references (face only, not hair)' : 'Face and hair references'}`
  }
  • Image ${refCount + 1}: Target scene with body, clothing, pose, environment, lighting
- Operation: ${isFaceOnly ? 'Face-only swap (preserve original hair)' : 'Face and hair swap'}
- You analyze the TARGET image (last one) to build the complete prompt

SEEDREAM 4.0 PROMPTING PRINCIPLES (Official Guide):
1. Natural Language: Combine subject + action + environment with concise style/color/lighting/composition words
2. Specificity: Use concrete, detailed language over abstract descriptions
3. Reference Roles: Clearly specify what each reference image provides
4. Context Definition: Define style + context + purpose for accurate output
5. Visible Elements: Describe only what is clearly visible; avoid speculation
6. Native Language: Use the language that best represents professional/cultural terms; prefer English for technical photography terms
7. Application Scenario: If the image has a specific use (e.g., "for PPT cover", "for social media post"), mention it for better scene alignment
8. Text in Images: If text should appear in the image, place it in quotation marks (e.g., "Generate a poster with the title \"Seedream V4.0\"")

OPTIMAL LENGTH: 150-400 words (comprehensive but focused, avoid redundancy)

OUTPUT STRUCTURE (Seedream 4.0 format):
"[Reference instruction]: Use the first ${refDescription} for ${isFaceOnly ? 'face structure only (keep original hair in target)' : 'face structure and hair style'}. Use image ${refCount + 1} as the complete reference for body, clothing, pose, action, scene, environment, lighting, and atmosphere.

[Subject details]: [Person's clothing with specific visible details - garments, accessories, jewelry, patterns, textures, colors, cuts]. [Exact pose - standing/sitting, body position, arm/leg placement]. [Action and body language - what they're doing, gestures, expression type without facial features].

[Scene]: [Location type and setting]. [Environment with architectural elements, furniture, props, clearly visible background]. [Spatial relationships, indoor/outdoor specifics].

[Lighting]: [Light source type and position, direction, quality (soft/hard), shadows, time of day, color temperature].

[Camera]: [Angle, perspective, depth of field, focal distance, composition rules, framing].

[Atmosphere]: [Mood, ambiance, weather if applicable, environmental effects like fog/rain/sunlight].

[Colors and textures]: [Dominant color palette, materials, surface properties, fabric types, color harmony].

[Technical quality]: High-resolution, sharp focus, professional photography, optimal visual quality."

CRITICAL RULES (Seedream 4.0 Safety):
- DESCRIBE: Clothing details, pose, action, body language, expression type (smiling/serious)
- NEVER DESCRIBE: ${isFaceOnly ? 'Hair (color/style/length/texture), ' : ''}Facial features (eyes/nose/mouth/face shape), skin tone, ethnicity
- Use "this person" or "the subject" for the individual
- Only describe clearly visible, relevant elements - no speculation or invention
- Focus on elements that contribute to the scene - omit irrelevant minor details
- Output ONLY the prompt text
- No markdown, no explanations, no meta-commentary`
}

/**
 * Build user message for Seedream 4.0 face-swap operations
 * Applies Seedream 4.0 guide principles: natural language, specificity, context
 */
function buildSeedreamFaceSwapUserText(refCount: number, swapMode: SwapMode): string {
  const isFaceOnly = swapMode === 'face'
  
  return `Analyze the target image (image ${refCount + 1}) and create a complete, production-ready Seedream 4.0 prompt following the format in the system instructions.

KEY REQUIREMENTS (Seedream 4.0 Guide):
- Be specific and detailed: Use concrete language, not abstract descriptions
- Natural language flow: Combine subject + action + environment naturally
- Reference roles: First ${refCount} image${refCount > 1 ? 's' : ''} = ${isFaceOnly ? 'face structure only (NOT hair)' : 'face and hair'}; Last image = body/clothing/pose/scene
- Clearly visible only: Describe what you actually see - no speculation or invention
- Relevant elements: Focus on details that contribute to the scene; omit minor irrelevant elements
- Application scenario: If the image appears to be for a specific use (PPT, social media, poster, etc.), mention it
- Text in images: If any text should appear, use quotation marks (e.g., "title \"Seedream V4.0\"")
- Safety constraints: NEVER describe ${isFaceOnly ? 'hair, ' : ''}facial features, skin tone, or ethnicity

OUTPUT: Structured Seedream 4.0 prompt with reference instruction, subject details, scene, lighting, camera, atmosphere, colors, technical quality. No markdown, no explanations.`
}

/**
 * Build system prompt for Seedream 4.0 target-only image enhancement
 * Integrates official Seedream 4.0 prompting guide principles
 */
function buildSeedreamTargetOnlySystemPrompt(): string {
  return `You are an expert at creating production-ready Seedream 4.0 image enhancement prompts.

SEEDREAM 4.0 CONTEXT:
- Operation: Enhance/improve a single target image (no face swap)
- Goal: Create a structured prompt that describes the image for quality enhancement
- Preserve: Original composition, style, and all visible elements

SEEDREAM 4.0 PROMPTING PRINCIPLES (Official Guide):
1. Natural Language: Combine subject + action + environment with concise style/color/lighting/composition
2. Specificity: Use concrete, detailed language over abstract descriptions ("elegant silk dress" not "nice outfit")
3. Context Definition: Specify style + context + purpose for accurate output
4. Visible Elements Only: Describe what is clearly visible; no speculation or invention
5. Relevance: Focus on elements that contribute to the scene; omit irrelevant minor details
6. Native Language: Use the language that best represents professional/cultural terms; prefer English for technical photography terms
7. Application Scenario: If the image has a specific use (e.g., "for PPT cover", "for social media post"), mention it for better scene alignment
8. Text in Images: If text should appear in the image, place it in quotation marks (e.g., "Generate a poster with the title \"Seedream V4.0\"")

OPTIMAL LENGTH: 120-350 words (detailed but concise, avoid generic quality terms like "beautiful" or "amazing")

OUTPUT STRUCTURE (Seedream 4.0 enhancement format):
"[Subject details]: [Person's clothing with specific visible details - garments, accessories, jewelry, patterns, textures, colors, cuts]. [Exact pose - standing/sitting/lying, body position, arm/leg/hand placement]. [Action and body language - what they're doing, gestures, expression visible in posture and body language].

[Scene]: [Location type and setting - indoor/outdoor, specific room/venue/landscape]. [Environment with architectural elements, furniture, props, objects]. [Spatial relationships, layout, depth, foreground/background].

[Lighting]: [Light source type and position, direction, quality (soft/hard/diffused), shadows, time of day, color temperature, highlights, contrast].

[Camera]: [Angle (eye-level/low/high), perspective, depth of field, focal point, composition rules (rule of thirds/golden ratio), framing, distance from subject].

[Atmosphere]: [Mood, ambiance, weather effects (fog/rain/sunlight), environmental atmosphere, emotional tone].

[Colors and textures]: [Dominant color palette, material properties, surface textures, fabric types, finish (matte/glossy), color harmony and relationships].

[Technical quality]: High-resolution, sharp focus, professional photography, enhanced for optimal visual quality while preserving original composition and style."

CRITICAL RULES (Seedream 4.0 Best Practices):
- Describe ONLY clearly visible elements - no speculation or invented content
- Use concrete, specific language: "navy blue blazer with gold buttons" not "nice jacket"
- Include technical photography terms for lighting and camera work
- Focus on relevant details that define the scene - omit minor irrelevant background elements
- Preserve the scene intent while enhancing quality
- Output ONLY the formatted prompt text
- No markdown, no meta-commentary, no explanations`
}

/**
 * Build user message for Seedream 4.0 target-only enhancement
 * Applies Seedream 4.0 guide: natural language, specificity, context definition
 */
function buildSeedreamTargetOnlyUserText(): string {
  return `Analyze this image and create a complete, production-ready Seedream 4.0 enhancement prompt following the format in system instructions.

SEEDREAM 4.0 REQUIREMENTS:
- Be specific and detailed: Use concrete language ("crimson velvet gown" not "red dress")
- Natural language flow: Combine elements smoothly with descriptive, connected phrases
- Clearly visible only: Describe what you actually see in the image
- Context definition: Include style + mood + purpose to guide accurate enhancement
- Application scenario: If the image appears to be for a specific use (PPT, social media, poster, etc.), mention it
- Text in images: If any text should appear, use quotation marks (e.g., "poster with title \"Seedream V4.0\"")
- Relevant elements: Focus on key details that define the scene; omit minor irrelevant items

DESCRIBE: Subject (clothing, pose, action), scene (location, environment), lighting (source, quality, mood), camera (angle, composition), atmosphere, colors/textures, technical quality.

OUTPUT: Structured Seedream 4.0 prompt. No markdown, no explanations.`
}

/**
 * Build system prompt for Seedream 4.0 prompt enhancement
 * Integrates official Seedream 4.0 prompting guide principles for refinement
 */
function buildEnhanceSystemPrompt(swapMode: SwapMode): string {
  const isFaceOnly = swapMode === 'face'

  return `You are an expert Seedream 4.0 prompt editor and refiner.

YOUR TASK: Refine and enhance an existing Seedream prompt based on user instructions while maintaining production quality and safety.

SEEDREAM 4.0 ENHANCEMENT PRINCIPLES (Official Guide):
1. Natural Language: Ensure subject + action + environment flow naturally with concise style/color/lighting
2. Specificity Over Abstraction: Replace vague terms with concrete, detailed descriptions
3. Context Definition: Strengthen style + mood + purpose alignment
4. Visible Elements: Keep only clearly visible, relevant details - remove speculation
5. Editing Formula: Apply changes as Action + Object + Attribute. Use operation prefixes when appropriate:
   - [Addition]: Add new elements (e.g., "[Addition] Add warm golden hour lighting")
   - [Deletion]: Remove elements (e.g., "[Deletion] Remove distracting background elements")
   - [Replacement]: Replace elements (e.g., "[Replacement] Replace afternoon lighting with dramatic sunset lighting")
   - [Modification]: Modify attributes (e.g., "[Modification] Change atmosphere from casual to formal elegant")
6. Native Language: Maintain the language that best represents professional/cultural terms
7. Application Scenario: If user mentions a specific use case, incorporate it (e.g., "for PPT cover", "for social media")
8. Text in Images: If text should appear, use quotation marks (e.g., "poster with title \"Seedream V4.0\"")

OPTIMAL LENGTH: Maintain similar length to original unless expansion is specifically requested (aim for concise precision)

INPUT STRUCTURE:
- EXISTING PROMPT: Current Seedream prompt to refine
- USER INSTRUCTIONS: Specific changes requested (e.g., "make lighting more dramatic", "change to sunset atmosphere")
- REFERENCE & TARGET IMAGES: For visual context only

CRITICAL RULES (Seedream 4.0 Safety & Quality):
1. APPLY USER INSTRUCTIONS: Faithfully implement requested changes using Seedream editing principles
2. PRESERVE REFERENCE ROLES: Do not alter how reference images are used (face swap scope must stay ${isFaceOnly ? 'face-only' : 'face+hair'})
3. MAINTAIN SAFETY: NEVER describe ${isFaceOnly ? 'hair color/style (in face-only mode), ' : ''}facial features, skin tone, or ethnicity
4. KEEP STRUCTURE: Output must have Reference instruction → Subject → Scene → Lighting → Camera → Atmosphere → Colors → Quality
5. ENHANCE SPECIFICITY: Replace abstract terms with concrete descriptions ("warm golden-hour sunlight" not "nice lighting")
6. RELEVANCE: Remove irrelevant details that don't contribute to the scene

OUTPUT FORMAT (Seedream 4.0 Structure):
Must follow standard Seedream rich prompt: [Reference usage] → [Subject details] → [Scene] → [Lighting] → [Camera] → [Atmosphere] → [Colors/textures] → [Technical quality].
Output ONLY the enhanced prompt text. No markdown, no explanations.`
}

/**
 * Build user message for Seedream 4.0 prompt enhancement
 * Applies Seedream 4.0 editing principles: Action + Object + Attribute
 */
function buildEnhanceUserText(existingPrompt: string, userInstructions: string): string {
  return `EXISTING PROMPT:
"${existingPrompt}"

USER INSTRUCTIONS:
"${userInstructions}"

ENHANCEMENT TASK (Seedream 4.0 Guide):
Refine the existing prompt to satisfy user instructions while applying Seedream 4.0 best practices:

APPLY SEEDREAM 4.0 PRINCIPLES:
- Editing Formula: Interpret instructions as Action + Object + Attribute. Use operation prefixes when clear:
  • [Addition] for adding new elements
  • [Deletion] for removing elements
  • [Replacement] for replacing elements
  • [Modification] for changing attributes
- Natural Language: Ensure smooth, connected descriptions (subject + action + environment)
- Specificity: Replace abstract terms with concrete details ("crimson velvet evening gown" not "nice dress")
- Context Definition: Strengthen style + mood + purpose alignment. Include application scenario if mentioned.
- Text Handling: If text should appear in image, use quotation marks (e.g., "title \"Seedream V4.0\"")
- Relevant Elements: Keep only clearly visible details that contribute to the scene

MAINTAIN SAFETY & STRUCTURE:
- Follow Seedream 4.0 prompt structure: Reference → Subject → Scene → Lighting → Camera → Atmosphere → Colors → Quality
- Do NOT describe facial features or skin tone
- Remove any irrelevant details that don't contribute to the scene
- Preserve reference image roles and swap mode constraints

OUTPUT: Enhanced Seedream 4.0 prompt only. No markdown, no explanations.`
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
  
  // Check length - should be substantial but allow for comprehensive descriptions
  const wordCount = generatedPrompt.split(/\s+/).length
  if (wordCount < 80) {
    console.log(`${model} rejected: too short (${wordCount} words, need at least 80)`)
    throw new Error('Generated prompt is too brief for rich Seedream format, retrying with different model')
  }
  // Increased limit to allow comprehensive Seedream prompts (up to ~800 words = ~1000 tokens)
  if (wordCount > 800) {
    console.log(`${model} rejected: too long (${wordCount} words, max 800)`)
    throw new Error('Generated prompt is too verbose, retrying with different model')
  }
  
  // For face-swap mode, check for reference usage statement
  if (hasRefs) {
    const hasReferenceUsage = /\buse.*reference.*image/i.test(generatedPrompt)
    if (!hasReferenceUsage) {
      console.log(`${model} rejected: missing reference usage statement`)
      throw new Error('Face-swap prompt must explain how to use reference images, retrying with different model')
    }
  }
  
  // Check for required sections (at least some must be present)
  const hasSubjectDetails = /\bsubject details\b/i.test(generatedPrompt) || 
                           /\bwearing\b/i.test(generatedPrompt) ||
                           /\bclothing\b/i.test(generatedPrompt)
  const hasSceneInfo = /\bscene\b/i.test(generatedPrompt) || 
                      /\benvironment\b/i.test(generatedPrompt) ||
                      /\bsetting\b/i.test(generatedPrompt)
  const hasLighting = /\blighting\b/i.test(generatedPrompt) || /\blight\b/i.test(generatedPrompt)
  const hasCamera = /\bcamera\b/i.test(generatedPrompt) || 
                   /\bangle\b/i.test(generatedPrompt) ||
                   /\bperspective\b/i.test(generatedPrompt)
  
  const sectionCount = [hasSubjectDetails, hasSceneInfo, hasLighting, hasCamera].filter(Boolean).length
  if (sectionCount < 3) {
    console.log(`${model} rejected: missing required sections (only ${sectionCount}/4 present)`)
    throw new Error('Generated prompt must include subject, scene, lighting, and camera sections, retrying with different model')
  }
  
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
    
    // Face-only mode: should not describe hair in detail
    if (isFaceOnly) {
      const hairDescriptors = ['hair color', 'blonde hair', 'brown hair', 'black hair', 'red hair', 'hair style', 'curly hair', 'straight hair', 'long hair', 'short hair']
      const hasHairDescription = hairDescriptors.some(desc =>
        generatedPrompt.toLowerCase().includes(desc.toLowerCase())
      )
      
      if (hasHairDescription) {
        const found = hairDescriptors.filter(desc =>
          generatedPrompt.toLowerCase().includes(desc.toLowerCase())
        )
        console.log(`${model} rejected: face-only mode should not describe hair:`, found)
        throw new Error('Face-only mode prompt must not describe hair details, retrying with different model')
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
  swapMode: SwapMode = 'face-hair'
): Promise<string> {
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
      return await generatePromptWithModel(model, refUrls, targetUrl, apiKey, swapMode)
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
  swapMode: SwapMode = 'face-hair'
): Promise<string> {
  console.log('[enhancePromptWithGrok] Entry point:', {
    existingPromptLength: existingPrompt.length,
    instructionsLength: userInstructions.length,
    refUrlsCount: refUrls.length,
    swapMode
  })

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  const systemPrompt = buildEnhanceSystemPrompt(swapMode)
  const userText = buildEnhanceUserText(existingPrompt, userInstructions)

  // Build user message content with images
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: userText
    }
  ]

  // Add reference images
  refUrls.forEach((url) => {
    userContent.push({
      type: 'image_url',
      image_url: { url }
    })
  })

  // Add target image last
  userContent.push({
    type: 'image_url',
    image_url: { url: targetUrl }
  })

  // Try each model until one succeeds
  for (const model of GROK_MODELS) {
    try {
      return await enhancePromptWithModel(model, systemPrompt, userContent, apiKey, swapMode, refUrls.length > 0)
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
  
  // Seedream 4.0 parameters optimized for prompt enhancement
  const requestBody: GrokVisionRequest = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.55, // Slightly higher creativity for enhancements and edits
    max_tokens: 1100,  // Higher to allow comprehensive enhanced Seedream prompts
    top_p: 0.9
  }

  // Only add penalty parameters for older models that support them
  if (!isNewerModel) {
    requestBody.frequency_penalty = 0.3
    requestBody.presence_penalty = 0.2
  }

  console.log(`${model} sending enhancement request to Grok:`, {
    promptStyle: 'seedream-4.0',
    maxTokens: 1100,
    temperature: 0.55
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

  // Seedream 4.0 parameters optimized for target-only enhancement
  // Increased token limit to allow comprehensive descriptions (~800 words)
  const maxTokens = 1000
  const temperature = 0.45  // Balance between creativity and consistency

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
  swapMode: SwapMode = 'face-hair'
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
  const systemPrompt = buildSeedreamFaceSwapSystemPrompt(refCount, swapMode)
  const userText = buildSeedreamFaceSwapUserText(refCount, swapMode)

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

  // Seedream 4.0 parameters optimized for face-swap with vision
  // Increased token limit to allow comprehensive descriptions (~800 words)
  const maxTokens = 1100  // Higher for face-swap (more complex multi-image analysis)
  const temperature = 0.5  // Balanced for detailed descriptions
  const topP = 0.9
  const frequencyPenalty = 0.3  // Encourage varied vocabulary
  const presencePenalty = 0.2   // Slight penalty for repetition

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
 */
function generateFallbackPrompt(refUrls: string[], swapMode: SwapMode = 'face-hair'): string {
  const isFaceOnly = swapMode === 'face'
  const refCount = refUrls.length
  const refDescription = refCount === 1 ? 'reference image' : `${refCount} reference images`
  
  // Seedream 4.0 structured fallback template
  return `Use the first ${refDescription} for ${isFaceOnly ? 'face structure only (preserve original hair)' : 'face structure and hair style'}. Use the target image as the complete reference for body, clothing, pose, action, scene, environment, lighting, and atmosphere.

Subject details: The person is wearing the clothing visible in the target image, maintaining the exact pose and body position shown. The action and body language follow the target scene naturally.

The scene: Indoor or outdoor setting as shown in the target image. The environment features the visible architectural elements, furniture, and background details present in the target.

Lighting: Natural or artificial lighting as visible in the target image, with shadows and highlights that match the original scene's lighting setup and mood.

Camera: Standard perspective and composition that matches the target image's framing, depth of field, and viewing angle.

Atmosphere: The overall mood and ambiance match the target scene, preserving the environmental effects and emotional tone visible in the original.

Colors and textures: Color palette and material properties match those visible in the target image, maintaining the original color harmony and surface textures.

Technical quality: High-resolution, sharp focus, professional photography quality, enhanced while preserving the original composition and style.`
}
