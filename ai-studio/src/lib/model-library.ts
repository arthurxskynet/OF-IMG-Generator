'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CreateLibraryAssetPayload, ModelLibraryAsset } from '@/types/library'

interface CopyLibraryAssetResponse {
  objectPath: string
}

const buildEndpoint = (modelId: string) => `/api/models/${modelId}/library`

export function useModelLibrary(modelId: string) {
  const [assets, setAssets] = useState<ModelLibraryAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAssets = useCallback(async () => {
    if (!modelId) return
    setIsLoading(true)
    try {
      const res = await fetch(buildEndpoint(modelId), { cache: 'no-store' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to load library assets')
      }
      const data = await res.json()
      setAssets(Array.isArray(data.assets) ? data.assets : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library assets')
    } finally {
      setIsLoading(false)
    }
  }, [modelId])

  useEffect(() => {
    fetchAssets().catch(() => {})
  }, [fetchAssets])

  const createAsset = useCallback(async (payload: CreateLibraryAssetPayload) => {
    const res = await fetch(buildEndpoint(modelId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'Failed to save library asset')
    }

    const data = await res.json()
    const asset = data.asset as ModelLibraryAsset
    setAssets(prev => [asset, ...prev])
    return asset
  }, [modelId])

  const deleteAsset = useCallback(async (assetId: string) => {
    const res = await fetch(`${buildEndpoint(modelId)}?assetId=${encodeURIComponent(assetId)}`, {
      method: 'DELETE'
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'Failed to delete library asset')
    }

    setAssets(prev => prev.filter(asset => asset.id !== assetId))
  }, [modelId])

  const copyAssetToTargets = useCallback(async (assetId: string): Promise<CopyLibraryAssetResponse> => {
    const res = await fetch(buildEndpoint(modelId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'copy-to-targets', assetId })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'Failed to copy asset to targets')
    }

    return res.json()
  }, [modelId])

  return {
    assets,
    isLoading,
    error,
    refresh: fetchAssets,
    createAsset,
    deleteAsset,
    copyAssetToTargets,
    setAssets
  }
}
