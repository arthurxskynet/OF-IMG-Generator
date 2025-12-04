/**
 * WaveSpeed API Model Configuration
 * Defines available models, their endpoints, parameters, and metadata
 */

export interface WaveSpeedModel {
  id: string
  name: string
  endpoint: string
  supportedResolutions: string[]
  supportedAspectRatios: string[]
  defaultResolution: string
  defaultAspectRatio: string
  defaultOutputFormat: string
  pricing?: {
    [resolution: string]: number
  }
}

/**
 * Available WaveSpeed models for image generation
 */
export const WAVESPEED_MODELS: Record<string, WaveSpeedModel> = {
  'nano-banana-pro-edit': {
    id: 'nano-banana-pro-edit',
    name: 'Nano Banana',
    endpoint: '/api/v3/google/nano-banana-pro/edit',
    supportedResolutions: ['1k', '2k', '4k'],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    defaultResolution: '1k',
    defaultAspectRatio: '1:1',
    defaultOutputFormat: 'png',
    pricing: {
      '1k': 0.14,
      '2k': 0.14,
      '4k': 0.24
    }
  },
  'seedream-v4-edit': {
    id: 'seedream-v4-edit',
    name: 'SeaDream',
    endpoint: '/api/v3/bytedance/seedream-v4/edit',
    supportedResolutions: [], // Uses size parameter instead
    supportedAspectRatios: [], // Uses size parameter instead
    defaultResolution: '',
    defaultAspectRatio: '',
    defaultOutputFormat: 'png',
    pricing: undefined
  }
}

/**
 * Default model ID
 */
export const DEFAULT_MODEL_ID = 'seedream-v4-edit'

/**
 * Get model configuration by ID
 */
export function getWaveSpeedModel(modelId: string): WaveSpeedModel {
  const model = WAVESPEED_MODELS[modelId]
  if (!model) {
    console.warn(`Unknown model ID: ${modelId}, falling back to default`)
    return WAVESPEED_MODELS[DEFAULT_MODEL_ID]
  }
  return model
}

/**
 * Convert width/height dimensions to aspect ratio string
 */
export function dimensionsToAspectRatio(width: number, height: number): string {
  // Calculate GCD to simplify ratio
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  const w = width / divisor
  const h = height / divisor
  
  // Map to supported aspect ratios
  const ratio = w / h
  
  // Common aspect ratios with tolerance
  if (Math.abs(ratio - 1) < 0.01) return '1:1'
  if (Math.abs(ratio - 1.5) < 0.01) return '3:2'
  if (Math.abs(ratio - 0.667) < 0.01) return '2:3'
  if (Math.abs(ratio - 0.75) < 0.01) return '3:4'
  if (Math.abs(ratio - 1.333) < 0.01) return '4:3'
  if (Math.abs(ratio - 0.8) < 0.01) return '4:5'
  if (Math.abs(ratio - 1.25) < 0.01) return '5:4'
  if (Math.abs(ratio - 0.5625) < 0.01) return '9:16'
  if (Math.abs(ratio - 1.778) < 0.01) return '16:9'
  if (Math.abs(ratio - 2.333) < 0.01) return '21:9'
  
  // Fallback: return calculated ratio
  return `${w}:${h}`
}

/**
 * Convert width/height dimensions to resolution (1k/2k/4k) for Nano Banana
 */
export function dimensionsToResolution(width: number, height: number): string {
  const maxDimension = Math.max(width, height)
  
  if (maxDimension <= 1024) return '1k'
  if (maxDimension <= 2048) return '2k'
  return '4k'
}

/**
 * Get all available models as an array
 */
export function getAvailableModels(): WaveSpeedModel[] {
  return Object.values(WAVESPEED_MODELS)
}

