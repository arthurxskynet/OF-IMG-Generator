import probe from 'probe-image-size'

// Always return 4096x4096 for best results regardless of input image size
export async function getRemoteImageSizeAsSeedream(inputUrl: string, fallback: string = '4096*4096'): Promise<string> {
  // Always use 4096x4096 for consistent high-quality output
  return '4096*4096'
}
