import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
const USE_LLM_FACESWAP = process.env.PROMPT_USE_LLM_FACESWAP !== 'false'
// Try different model names in order of preference (latest models first)
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212', 'grok-2-image-1212']
// const GROK_VISION_MODEL = GROK_MODELS[0] // Start with the most likely to work

export type SwapMode = 'face' | 'face-hair'

// Deterministic, single-sentence face-swap prompt builder
function buildFaceSwapPrompt(refCount: number, swapMode: SwapMode): string {
  const faceOnly = swapMode === 'face'
  if (faceOnly) {
    return 'Swap only the face from the first image of reference person onto the second image of target person; keep the hair unchanged and leave everything else in the second image unchanged.'
  }
  return 'Swap the face and hair from the first image of reference person onto the second image of target person; leave everything else in the second image unchanged.'
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
  const isVisionModel = model.includes('vision') || model.includes('image') || 
                       ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)

  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Build the system prompt for target-only image enhancement/editing
  const systemPrompt = `You write simple image enhancement instructions for Seedream v4. 
You will see a target image that needs to be enhanced or edited.
Write ONE sentence that tells Seedream to enhance or improve the image.
Focus on general improvements like better lighting, clarity, composition, or style.
Use simple words. No technical terms. No bullet points or structured format.
Example: "Enhance this image with better lighting and improved clarity while keeping the same style and composition."`

  // Build the user message content for target-only processing
  const userContent: GrokVisionContent[] = [
    { 
      type: 'text', 
      text: `Write one simple sentence for enhancing this image. Focus on general improvements like lighting, clarity, composition, or style. Keep the same overall appearance but make it better.`
    },
    {
      type: 'image_url',
      image_url: { url: targetUrl }
    }
  ]

  // Log image passing details for target-only
  console.log(`${model} sending target-only request to Grok:`, {
    totalImages: 1,
    refImagesCount: 0,
    hasTarget: !!targetUrl,
    imageOrder: 'target only',
    promptType: 'target-only'
  })

  const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 100,
      temperature: 0.7
    })
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
        const isVisionModel = model.includes('vision') || model.includes('image') || 
                             ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Determine swap elements based on mode - be very explicit
  const isFaceOnly = swapMode === 'face'
  const refCount = refUrls.length
  const totalImages = refCount + 1 // N reference images + 1 target image

  // Ultra-direct system instruction - exactly what we want
  const systemPrompt = `You must output exactly one sentence in this format:
${isFaceOnly 
  ? '"Swap only the face from the first image of [visual description] onto the second image of [visual description]; keep the hair unchanged and leave everything else in the second image unchanged."'
  : '"Swap the face and hair from the first image of [visual description] onto the second image of [visual description]; leave everything else in the second image unchanged."'}
Replace [visual description] with 2-5 words describing what you see in each image. Do not write anything else. Do not explain. Do not add markdown. Output only the single sentence.`

  // Minimal user message - no analysis, just direct instruction
  const userContent: GrokVisionContent[] = [
    {
      type: 'text',
      text: `${isFaceOnly 
  ? 'Swap only the face from the first image of [describe first image in 2-5 words] onto the second image of [describe second image in 2-5 words]; keep the hair unchanged and leave everything else in the second image unchanged.'
  : 'Swap the face and hair from the first image of [describe first image in 2-5 words] onto the second image of [describe second image in 2-5 words]; leave everything else in the second image unchanged.'}`
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

  // Log image passing details and what's being sent to Grok
  const userTextContent = userContent.find(item => item.type === 'text') as { type: 'text', text: string } | undefined
  console.log(`${model} sending face-swap request to Grok:`, {
    totalImages: userContent.filter(item => item.type === 'image_url').length,
    refImagesCount: refUrls.length,
    hasTarget: !!targetUrl,
    imageOrder: 'ref first, then target',
    promptType: 'face-swap',
    swapMode: swapMode,
    isFaceOnly: isFaceOnly,
    systemPrompt: systemPrompt.substring(0, 200) + '...',
    userContentText: userTextContent?.text ? (userTextContent.text.substring(0, 200) + '...') : 'N/A'
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

        // Build request body with strict parameters for single sentence output
        const requestBody: GrokVisionRequest = {
          model: model,
          messages,
          temperature: 0.1, // Even lower for maximum consistency
          max_tokens: 50, // Very low - we only want one sentence
          top_p: 0.9, // Focused sampling
          frequency_penalty: 0.5, // Reduce repetition
          presence_penalty: 0.3, // Encourage conciseness
        }

        // Add parameters only for models that support them
        const isNewerModel = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
        
        if (!isNewerModel) {
          // Older models support these parameters
          requestBody.top_p = 0.9
          requestBody.frequency_penalty = 0.1
          requestBody.presence_penalty = 0.1
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
      refUrlsCount: refUrls.length,
      hasTarget: !!targetUrl,
      swapMode: swapMode
    })

    // Validate response content - enforce single short sentence and correct mode terms
    console.log(`${model} starting validation for face-swap prompt`, {
      refUrlsCount: refUrls.length,
      promptLength: generatedPrompt.length,
      promptPreview: generatedPrompt.substring(0, 100) + (generatedPrompt.length > 100 ? '...' : ''),
      swapMode: swapMode
    })

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

    console.log(`${model} prompt generation successful:`, {
      model,
      promptLength: generatedPrompt.length,
      refImagesCount: refUrls.length,
      promptType: refUrls.length > 0 ? 'face-swap' : 'target-only',
      validationPassed: true,
      swapMode: swapMode
    })

    return generatedPrompt
  } catch (error) {
    console.error(`${model} API error:`, error)
    throw error instanceof Error ? error : new Error(`Failed to generate prompt with ${model}`)
  }
}

function generateFallbackPrompt(refUrls: string[], swapMode: SwapMode = 'face-hair'): string {
  // One-line fallback using deterministic builder
  return buildFaceSwapPrompt(refUrls.length, swapMode)
}
