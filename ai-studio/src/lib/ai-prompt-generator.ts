import { GrokVisionRequest, GrokVisionResponse, GrokVisionMessage, GrokVisionContent } from '@/types/ai-prompt'

const XAI_API_BASE = 'https://api.x.ai/v1'
// Try different model names in order of preference (latest models first)
const GROK_MODELS = ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-2-vision-1212', 'grok-2-image-1212']
// const GROK_VISION_MODEL = GROK_MODELS[0] // Start with the most likely to work

export async function generatePromptWithGrok(refUrls: string[], targetUrl: string): Promise<string> {
  // Handle target-only processing (no reference images)
  if (!refUrls || refUrls.length === 0) {
    return generateTargetOnlyPrompt(targetUrl)
  }
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set')
  }

  // Try each model in order until one works
  for (const model of GROK_MODELS) {
    try {
      return await generatePromptWithModel(model, refUrls, targetUrl, apiKey)
    } catch (error) {
      console.warn(`Model ${model} failed, trying next model:`, error instanceof Error ? error.message : error)
      // If this is the last model, use fallback template
      if (model === GROK_MODELS[GROK_MODELS.length - 1]) {
        console.warn('All models failed, using fallback template')
        return generateFallbackPrompt(refUrls)
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

async function generatePromptWithModel(model: string, refUrls: string[], targetUrl: string, apiKey: string): Promise<string> {
        // Check if this model supports vision
        const isVisionModel = model.includes('vision') || model.includes('image') || 
                             ['grok-4-fast-reasoning', 'grok-4', 'grok-3-mini'].includes(model)
  
  if (!isVisionModel) {
    throw new Error(`Model ${model} does not support vision capabilities`)
  }

  // Build the system prompt optimized for Seedream v4
  const systemPrompt = `You write simple face swap instructions for Seedream v4. 
You will see reference images (faces to copy) and a target image (body/scene to keep).
Write ONE sentence that tells Seedream to swap the face from the reference image onto the target image.
For reference images: describe clothing or pose to identify the person.
For target image: only mention simple setting or background, avoid describing the person's appearance.
Mention face and hair to ensure proper blending. Use simple words. No technical terms. No bullet points or structured format.
Example: "Take the face and hair from the person in the first image who is wearing blue and perfectly put it on the person in the second image in the bedroom, keep everything else the same."`

  // Build the user message content optimized for Seedream v4
  const userContent: GrokVisionContent[] = [
    { 
      type: 'text', 
      text: `Write one simple sentence for face swapping. The first ${refUrls.length} image${refUrls.length > 1 ? 's' : ''} ${refUrls.length > 1 ? 'contain the faces to copy' : 'contains the face to copy'}. The last image is the target person. For reference images, use "who is" to describe clothing or pose. For target image, only mention setting or background, not the person's appearance. Mention face and hair for better blending.`
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
        const requestBody: GrokVisionRequest = {
          model: model,
          messages,
          temperature: 0.3, // Slightly higher for more descriptive, creative outputs
          max_tokens: 600, // Keep at 600 as requested
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
    console.log(`${model} generated prompt:`, generatedPrompt)

    // Validate response content (removed length restriction to avoid unnecessary limits)

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

    // Validate that the prompt contains identifying descriptions (not just generic text)
    const isGeneric = generatedPrompt.toLowerCase().includes('first image') && 
                     generatedPrompt.toLowerCase().includes('second image') &&
                     !generatedPrompt.toLowerCase().includes('who is') && // No "who is" descriptions
                     !generatedPrompt.toLowerCase().includes('wearing') && // No clothing descriptions
                     !generatedPrompt.toLowerCase().includes('sitting') && // No pose descriptions
                     !generatedPrompt.toLowerCase().includes('standing') && // No pose descriptions
                     !generatedPrompt.toLowerCase().includes('in') // No setting descriptions
    
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
      refImagesCount: refUrls.length
    })

    return generatedPrompt
  } catch (error) {
    console.error(`${model} API error:`, error)
    throw error instanceof Error ? error : new Error(`Failed to generate prompt with ${model}`)
  }
}

function generateFallbackPrompt(refUrls: string[]): string {
  // Generate a simple, jargon-free fallback prompt with clear image references
  const refText = refUrls.length > 1 ? 'first images' : 'first image'
  const targetText = refUrls.length > 1 ? 'last image' : 'second image'
  return `Take the face from the person in the ${refText} and put it on the person in the ${targetText}, keep everything else the same.`
}
