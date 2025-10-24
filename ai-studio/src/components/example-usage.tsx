'use client'

/**
 * Example usage of the ModelWorkspace component
 * 
 * This shows how to integrate the ModelWorkspace into your application
 */

import { useState, useEffect } from 'react'
import { ModelWorkspace } from './model-workspace'
import { Toaster } from '@/hooks/use-toast'
import { Model, ModelRow } from '@/types/jobs'

export function ExampleUsage() {
  const [model, setModel] = useState<Model | null>(null)
  const [rows, setRows] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch model and rows data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Replace with your actual API calls
        // const modelData = await fetch('/api/models/your-model-id').then(r => r.json())
        // const rowsData = await fetch('/api/models/your-model-id/rows').then(r => r.json())
        
        // Example data structure
        const exampleModel: Model = {
          id: 'model-1',
          name: 'My AI Model',
          team_id: 'team-1',
          owner_id: 'user-1',
          default_prompt: 'A professional headshot',
          default_ref_headshot_url: 'refs/default-ref.jpg',
          size: '2227*3183',
          requests_default: 6,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        const exampleRows: ModelRow[] = [
          {
            id: 'row-1',
            model_id: 'model-1',
            target_image_url: 'targets/target-1.jpg',
            prompt_override: 'A smiling professional headshot',
            status: 'idle',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]

        setModel(exampleModel)
        setRows(exampleRows)
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])


  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  if (!model) {
    return <div className="p-8">Model not found</div>
  }

  return (
    <div className="container mx-auto p-6">
      <ModelWorkspace
        model={model}
        rows={rows}
      />
      <Toaster />
    </div>
  )
}
