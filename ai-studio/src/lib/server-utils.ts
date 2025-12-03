import probe from 'probe-image-size'

// Probe remote image dimensions using a signed URL with timeout
export async function getRemoteImageDimensions(inputUrl: string, timeoutMs: number = 5000): Promise<{ width: number; height: number }> {
  // Use Promise.race to add timeout protection
  const probePromise = probe(inputUrl)
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Image dimension probe timeout')), timeoutMs)
  })
  
  try {
    const result = await Promise.race([probePromise, timeoutPromise])
    const width = Number(result?.width) || 0
    const height = Number(result?.height) || 0
    if (!width || !height) {
      throw new Error('Could not determine remote image dimensions')
    }
    return { width, height }
  } catch (error) {
    // Re-throw with context
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error(`Image dimension probe timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const roundToMultiple = (value: number, multiple: number) => Math.round(value / multiple) * multiple

// Compute max-quality dimensions that match target aspect ratio within provider limits
export function computeMaxQualityDimensionsForRatio(
  modelWidth: number,
  modelHeight: number,
  targetWidth: number,
  targetHeight: number
): { width: number; height: number } {
  // Provider limits (WaveSpeed / Seedream v4 doc): 1024..4096 per side
  const MIN_DIM = 1024
  const MAX_DIM = 4096
  // Use the model's largest configured side as "max quality" baseline
  const baseMax = clamp(Math.max(modelWidth || MAX_DIM, modelHeight || MAX_DIM), MIN_DIM, MAX_DIM)
  const r = Math.max(0.0001, targetWidth / Math.max(1, targetHeight))

  let width: number
  let height: number

  if (r >= 1) {
    // Landscape or square: fill width first
    width = baseMax
    height = Math.floor(width / r)
  } else {
    // Portrait: fill height first
    height = baseMax
    width = Math.floor(height * r)
  }

  // Enforce provider constraints and round to convenient step for stability
  width = clamp(roundToMultiple(width, 64), MIN_DIM, MAX_DIM)
  height = clamp(roundToMultiple(height, 64), MIN_DIM, MAX_DIM)

  // If rounding/clamping broke the ratio badly (e.g., too small), re-balance:
  if (r >= 1) {
    // Recompute height from width to maintain ratio, then clamp again
    height = clamp(roundToMultiple(Math.floor(width / r), 64), MIN_DIM, MAX_DIM)
    // If height hit MIN and width is too small for ratio, recompute width from MIN height
    if (height === MIN_DIM) {
      width = clamp(roundToMultiple(Math.floor(height * r), 64), MIN_DIM, MAX_DIM)
    }
  } else {
    // Recompute width from height to maintain ratio
    width = clamp(roundToMultiple(Math.floor(height * r), 64), MIN_DIM, MAX_DIM)
    if (width === MIN_DIM) {
      height = clamp(roundToMultiple(Math.floor(width / r), 64), MIN_DIM, MAX_DIM)
    }
  }

  return { width, height }
}
