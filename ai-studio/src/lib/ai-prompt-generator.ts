import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
// Try different model names in order of preference (latest models first)
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212', 'grok-2-image-1212']
// const GROK_VISION_MODEL = GROK_MODELS[0] // Start with the most likely to work

export type SwapMode = 'face' | 'face-hair'

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

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Try each model in order until one works
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

  // Build optimized system prompt for Seedream v4 - explicit mode differentiation with multiple reference support
  const referenceText = refCount === 1 
    ? '1 reference image (source person)' 
    : `${refCount} reference images (source person)`
  
  const systemPrompt = `You write simple face swap instructions for Seedream v4.
You will see ${totalImages} images: ${referenceText} and 1 target image (destination scene - always the last image).
${isFaceOnly 
  ? 'Swap ONLY the face from the reference image(s) onto the target image. DO NOT swap hair - keep the target person\'s original hair.'
  : 'Swap the face AND hair from the reference image(s) onto the target image.'}
Keep the target image EXACTLY the same: poses, angles, composition, lighting, background, body, and clothing.
Write ONE concise sentence using simple words. No technical terms. No bullet points.
Always reference images clearly: reference images are the first ${refCount === 1 ? 'image' : refCount === 2 ? '2 images' : `${refCount} images`} (source), the last image is the target (destination).
${isFaceOnly
  ? refCount === 1
    ? 'Example: "Swap only the face from the person in the first image onto the person in the second image in the bedroom, keeping the target person\'s original hair and all poses exactly the same."'
    : `Example: "Swap only the face from the person in the reference images onto the person in the last image in the bedroom, keeping the target person's original hair and all poses exactly the same."`
  : refCount === 1
    ? 'Example: "Swap the face and hair from the person in the first image onto the person in the second image in the bedroom, keep poses, angles, and composition exactly the same."'
    : `Example: "Swap the face and hair from the person in the reference images onto the person in the last image in the bedroom, keep poses, angles, and composition exactly the same."`}`

  // Build user message with explicit mode instructions
  const refImagesText = refCount === 1 
    ? '1. First image = REFERENCE (source person'
    : `1. Images 1-${refCount} = REFERENCE IMAGES (source person`
  
  const targetImageText = refCount === 1
    ? '2. Second image = TARGET'
    : `${refCount + 1}. Last image = TARGET`
  
  const userContent: GrokVisionContent[] = [
    { 
      type: 'text', 
      text: `Write one simple sentence for ${isFaceOnly ? 'face-only swapping (NO hair)' : 'face and hair swapping'}.
You have ${totalImages} images in order:
${refImagesText} - ${isFaceOnly ? 'face only' : 'face and hair'} to copy)
${targetImageText} (destination scene - keep everything else exactly as is)
${isFaceOnly 
  ? 'CRITICAL: Only swap the face. Do NOT swap or mention hair - preserve the target person\'s original hair.'
  : 'Swap both face and hair from reference images to target.'}
${refCount === 1 
  ? 'Reference: identify simply (e.g., "first image" or person description).'
  : 'Reference: identify simply (e.g., "reference images", "first images", or person description).'}
Target: only mention setting/background context, never describe the person's appearance.
Preserve target poses, angles, composition, lighting, body, and clothing exactly.`
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

  // Log image passing details
  console.log(`${model} sending face-swap request to Grok:`, {
    totalImages: userContent.filter(item => item.type === 'image_url').length,
    refImagesCount: refUrls.length,
    hasTarget: !!targetUrl,
    imageOrder: 'ref first, then target',
    promptType: 'face-swap',
    swapMode: swapMode
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

        // Build request body with model-specific parameters
        // Lower temperature for more consistent, focused outputs that follow instructions precisely
        const requestBody: GrokVisionRequest = {
          model: model,
          messages,
          temperature: 0.2, // Lower for more consistent mode-specific outputs
          max_tokens: 400, // Reduced - prompts should be concise
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

    // Validate response content (removed length restriction to avoid unnecessary limits)
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

    // Validate that the prompt is not overly detailed or structured
    const isOverlyDetailed = generatedPrompt.includes('**') || // Markdown formatting
                            generatedPrompt.includes('###') || // Headers
                            generatedPrompt.includes('Image Descriptions') || // Structured format
                            generatedPrompt.includes('Key Visual Features') // Bullet points
    
    if (isOverlyDetailed) {
      console.log(`${model} rejected due to overly detailed/structured prompt`)
      throw new Error(`Generated prompt is too detailed or structured, retrying with different model`)
    }


    // Validate mode-specific content - ensure correct swap mode is followed
    if (isFaceOnly) {
      // For face-only mode, ensure hair is NOT mentioned or explicitly excluded
      const mentionsHairSwap = /\b(hair|hairstyle|hairstyles)\b/i.test(generatedPrompt) &&
                              (generatedPrompt.toLowerCase().includes('swap') || generatedPrompt.toLowerCase().includes('transfer'))
      if (mentionsHairSwap && !generatedPrompt.toLowerCase().includes('not') && !generatedPrompt.toLowerCase().includes('only')) {
        console.log(`${model} rejected: face-only mode but prompt mentions hair swap`)
        throw new Error(`Generated prompt for face-only mode incorrectly mentions hair swap, retrying with different model`)
      }
    } else {
      // For face-hair mode, ensure both face and hair are mentioned
      const mentionsFace = /\bface\b/i.test(generatedPrompt)
      const mentionsHair = /\b(hair|hairstyle|hairstyles)\b/i.test(generatedPrompt)
      if (!mentionsFace || !mentionsHair) {
        console.log(`${model} rejected: face-hair mode but prompt missing face or hair`)
        throw new Error(`Generated prompt for face-hair mode missing face or hair mention, retrying with different model`)
      }
    }

    // Validate that the prompt contains identifying descriptions (not just generic text)
    // Check for minimal identifiers: setting description (context like "in bedroom") or clothing/pose
    const hasSettingContext = /\bin\s+(the\s+)?(bedroom|kitchen|bathroom|office|park|beach|indoor|outdoor|room|setting|background)/i.test(generatedPrompt)
    const hasIdentifier = generatedPrompt.toLowerCase().includes('who is') || // "who is" descriptions
                          generatedPrompt.toLowerCase().includes('wearing') || // clothing descriptions
                          generatedPrompt.toLowerCase().includes('sitting') || // pose descriptions
                          generatedPrompt.toLowerCase().includes('standing') || // pose descriptions
                          hasSettingContext // setting context
    
    // Check for generic references - adapt based on number of reference images
    const hasGenericRef = refCount === 1
      ? (generatedPrompt.toLowerCase().includes('first image') && generatedPrompt.toLowerCase().includes('second image'))
      : (generatedPrompt.toLowerCase().includes('reference image') || generatedPrompt.toLowerCase().includes('first image'))
    
    const isGeneric = hasGenericRef && !hasIdentifier
    
    if (isGeneric) {
      console.log(`${model} rejected due to generic prompt without identifying descriptions`)
      throw new Error(`Generated prompt is too generic without identifying descriptions, retrying with different model`)
    }

    // Validate that target image description is safe (not describing person's appearance)
    const hasUnsafeTargetDescription = generatedPrompt.toLowerCase().includes('who is') && 
                                      (generatedPrompt.toLowerCase().includes('nude') ||
                                       generatedPrompt.toLowerCase().includes('topless') ||
                                       generatedPrompt.toLowerCase().includes('bent') ||
                                       generatedPrompt.toLowerCase().includes('looking'))
    
    if (hasUnsafeTargetDescription) {
      console.log(`${model} rejected due to unsafe target image description`)
      throw new Error(`Generated prompt has unsafe target description that could cause unwanted changes, retrying with different model`)
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
  // Generate minimal, jargon-free fallback prompt with explicit mode differentiation
  const isFaceOnly = swapMode === 'face'
  const refCount = refUrls.length
  
  // Build reference text based on number of reference images
  const refText = refCount === 1 
    ? 'the first image' 
    : 'the reference images'
  
  const targetText = refCount === 1
    ? 'the second image'
    : 'the last image'
  
  if (isFaceOnly) {
    return `Swap only the face from the person in ${refText} onto the person in ${targetText}, keep the target person's original hair and all poses, angles, and composition exactly the same.`
  } else {
    return `Swap the face and hair from the person in ${refText} onto the person in ${targetText}, keep poses, angles, and composition exactly the same.`
  }
}
