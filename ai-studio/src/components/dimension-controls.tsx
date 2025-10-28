'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Model } from '@/types/jobs'
import { validateDimensions, calculateAspectRatio, getDimensionPresets } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Monitor, Smartphone, Tablet, Square, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface DimensionControlsProps {
  model: Model
  onUpdate?: (model: Model) => void
}

export function DimensionControls({ model, onUpdate }: DimensionControlsProps) {
  const { toast } = useToast()
  const [width, setWidth] = useState(model.output_width || 4096)
  const [height, setHeight] = useState(model.output_height || 4096)
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const presets = getDimensionPresets()

  // Debounced save function
  const debouncedSave = useCallback(async (newWidth: number, newHeight: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!validateDimensions(newWidth, newHeight)) {
        toast({
          title: 'Invalid dimensions',
          description: 'Dimensions must be between 1024 and 4096 pixels',
          variant: 'destructive'
        })
        return
      }

      setIsSaving(true)
      try {
        const response = await fetch(`/api/models/${model.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            output_width: newWidth,
            output_height: newHeight
          })
        })

        if (!response.ok) {
          throw new Error('Failed to update dimensions')
        }

        const { model: updatedModel } = await response.json()
        onUpdate?.(updatedModel)
        
        toast({
          title: 'Dimensions updated',
          description: `Set to ${newWidth} × ${newHeight} px`
        })
      } catch (error) {
        console.error('Failed to save dimensions:', error)
        toast({
          title: 'Save failed',
          description: 'Failed to update dimensions',
          variant: 'destructive'
        })
      } finally {
        setIsSaving(false)
      }
    }, 500)
  }, [model.id, onUpdate, toast])

  // Handle dimension changes
  const handleWidthChange = useCallback((value: number[]) => {
    const newWidth = value[0]
    setWidth(newWidth)
    debouncedSave(newWidth, height)
  }, [height, debouncedSave])

  const handleHeightChange = useCallback((value: number[]) => {
    const newHeight = value[0]
    setHeight(newHeight)
    debouncedSave(width, newHeight)
  }, [width, debouncedSave])

  // Handle preset selection
  const handlePresetSelect = useCallback((presetWidth: number, presetHeight: number) => {
    setWidth(presetWidth)
    setHeight(presetHeight)
    debouncedSave(presetWidth, presetHeight)
  }, [debouncedSave])

  // Update local state when model changes
  useEffect(() => {
    setWidth(model.output_width || 4096)
    setHeight(model.output_height || 4096)
  }, [model.output_width, model.output_height])

  const aspectRatio = calculateAspectRatio(width, height)
  
  // Get device type icon based on aspect ratio
  const getDeviceIcon = (ratio: string) => {
    if (ratio === '1:1') return <Square className="h-4 w-4" />
    if (ratio === '16:9' || ratio === '9:16') return <Monitor className="h-4 w-4" />
    if (ratio === '4:3' || ratio === '3:4') return <Tablet className="h-4 w-4" />
    return <Smartphone className="h-4 w-4" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Output Dimensions
          {isSaving && <Spinner size="sm" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>These dimensions apply to all image generations in this model.</p>
              <p>Range: 1024-4096 pixels per side</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="ml-auto">
            {getDeviceIcon(aspectRatio)}
            {aspectRatio}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current dimensions display */}
        <div className="text-center p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
          <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            {width} × {height} px
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {aspectRatio} aspect ratio
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Total pixels: {(width * height).toLocaleString()}
          </div>
        </div>

        {/* Dimension sliders */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="width-slider">Width: {width}px</Label>
            <Slider
              id="width-slider"
              min={1024}
              max={4096}
              step={64}
              value={[width]}
              onValueChange={handleWidthChange}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="height-slider">Height: {height}px</Label>
            <Slider
              id="height-slider"
              min={1024}
              max={4096}
              step={64}
              value={[height]}
              onValueChange={handleHeightChange}
              className="w-full"
            />
          </div>
        </div>

        {/* Preset buttons */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Quick Presets</Label>
          {presets.map((category) => (
            <div key={category.label} className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                {getDeviceIcon(calculateAspectRatio(category.presets[0].width, category.presets[0].height))}
                {category.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {category.presets.map((preset) => (
                  <Button
                    key={`${preset.width}x${preset.height}`}
                    variant={width === preset.width && height === preset.height ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePresetSelect(preset.width, preset.height)}
                    className="text-xs transition-all duration-200 hover:scale-105"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
