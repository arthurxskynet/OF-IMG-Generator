import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Validate sizes like "WIDTH*HEIGHT"; clamp to [256, 4096]; fallback to default
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
