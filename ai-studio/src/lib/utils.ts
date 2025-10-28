import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Validate dimensions are within WaveSpeed API limits
export function validateDimensions(width: number, height: number): boolean {
  return width >= 1024 && width <= 4096 && height >= 1024 && height <= 4096
}

// Calculate aspect ratio as a formatted string
export function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  const w = width / divisor
  const h = height / divisor
  
  // Common ratios
  if (w === h) return '1:1'
  if (w === 4 && h === 3) return '4:3'
  if (w === 3 && h === 4) return '3:4'
  if (w === 16 && h === 9) return '16:9'
  if (w === 9 && h === 16) return '9:16'
  
  return `${w}:${h}`
}

// Get dimension presets for UI
export function getDimensionPresets() {
  return [
    {
      label: 'Square (1:1)',
      presets: [
        { width: 4096, height: 4096, label: '4K' },
        { width: 3072, height: 3072, label: '3K' },
        { width: 2048, height: 2048, label: '2K' },
        { width: 1024, height: 1024, label: '1K' }
      ]
    },
    {
      label: 'Landscape (4:3)',
      presets: [
        { width: 4096, height: 3072, label: '4K' },
        { width: 2048, height: 1536, label: '2K' }
      ]
    },
    {
      label: 'Portrait (3:4)',
      presets: [
        { width: 3072, height: 4096, label: '4K' },
        { width: 1536, height: 2048, label: '2K' }
      ]
    },
    {
      label: 'Wide (16:9)',
      presets: [
        { width: 4096, height: 2304, label: '4K' },
        { width: 2048, height: 1152, label: '2K' }
      ]
    },
    {
      label: 'Tall (9:16)',
      presets: [
        { width: 2304, height: 4096, label: '4K' },
        { width: 1152, height: 2048, label: '2K' }
      ]
    }
  ]
}

// Validate sizes like "WIDTH*HEIGHT"; clamp to [1024, 4096]; fallback to default
export function normalizeSizeOrDefault(input: string | undefined | null, fallback: string): string {
  if (!input || typeof input !== 'string') return fallback
  const match = input.trim().match(/^(\d+)\*(\d+)$/)
  if (!match) return fallback
  let w = parseInt(match[1], 10)
  let h = parseInt(match[2], 10)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return fallback
  // Clamp to provider limits (docs: 1024~4096 per dimension)
  w = Math.max(1024, Math.min(4096, w))
  h = Math.max(1024, Math.min(4096, h))
  return `${w}*${h}`
}
