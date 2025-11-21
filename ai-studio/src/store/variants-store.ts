'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { VariantImage } from '@/types/variants'

interface VariantsStore {
  images: VariantImage[]
  prompt: string | null
  addImages: (images: VariantImage[]) => void
  removeImage: (id: string) => void
  clearImages: () => void
  setPrompt: (prompt: string | null) => void
  reset: () => void
}

export const useVariantsStore = create<VariantsStore>()(
  persist(
    (set) => ({
      images: [],
      prompt: null,
      addImages: (images) => 
        set((state) => {
          // Prevent duplicates based on outputPath
          const existingPaths = new Set(state.images.map(img => img.outputPath))
          const newImages = images.filter(img => !existingPaths.has(img.outputPath))
          return { images: [...state.images, ...newImages] }
        }),
      removeImage: (id) => 
        set((state) => ({
          images: state.images.filter((img) => img.id !== id)
        })),
      clearImages: () => set({ images: [], prompt: null }),
      setPrompt: (prompt) => set({ prompt }),
      reset: () => set({ images: [], prompt: null })
    }),
    {
      name: 'variants-storage'
    }
  )
)

