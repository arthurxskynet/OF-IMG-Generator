'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Wand2, Copy, RefreshCw, Check, Sparkles } from 'lucide-react'

// Preset enhancement chips for quick access - organized by category
const PRESET_ENHANCEMENTS = {
  quality: [
    { label: '✨ Professional studio', value: 'Apply professional studio quality with even lighting distribution' },
    { label: '📸 Casual snapshot', value: 'Turn this into a casual phone snapshot: taken on smartphone front camera with flat indoor lighting, avoiding studio lighting and ultra-HD filters, keeping everything else the exact same' },
    { label: '🎥 Film grain', value: 'Add film grain texture with reduced sharpness' },
    { label: '📱 iPhone selfie', value: 'Apply iPhone front camera selfie with soft focus, avoiding studio polish, keeping everything else the exact same' }
  ],
  lighting: [
    { label: '🔥 Dramatic lighting', value: 'Apply dramatic lighting with balanced exposure' },
    { label: '🌅 Golden hour', value: 'Add golden hour lighting with warm color temperature and balanced exposure' },
    { label: '💡 Harsh overhead', value: 'Change to harsh overhead lighting with balanced exposure' },
    { label: '🌙 Low-key lighting', value: 'Apply low-key lighting with balanced exposure' },
    { label: '🎭 Rembrandt lighting', value: 'Apply Rembrandt lighting with balanced exposure' },
    { label: '🪟 Natural window light', value: 'Change to natural window lighting with balanced exposure' }
  ],
  degradation: [
    { label: '🎨 Lo-fi aesthetic', value: 'Add lo-fi aesthetic with chromatic aberration and lens distortion' },
    { label: '💨 Motion blur artifacts', value: 'Apply motion blur with camera shake and streaking' },
    { label: '✨ Lens flare', value: 'Add lens flare artifacts with washed-out highlights' },
    { label: '🎞️ Film grain texture', value: 'Add film grain with color shifts and reduced dynamic range' }
  ],
  composition: [
    { label: '📷 Casual snap', value: 'Turn this into a casual snapshot: candid composition with off-center framing, handheld phone camera perspective, flat indoor lighting, avoiding studio polish, keeping everything else the exact same' },
    { label: '🎯 Off-center framing', value: 'Apply off-center composition with subject positioned using rule of thirds, asymmetric framing, informal camera placement, keeping everything else the exact same' },
    { label: '👄 Bottom half face', value: 'Apply close-up crop showing only bottom half of face (mouth and chin visible), maintaining exact framing, keeping everything else the exact same' },
    { label: '👁️ Top half face', value: 'Apply close-up crop showing only top half of face (eyes and forehead visible), maintaining exact framing, keeping everything else the exact same' },
    { label: '⬅️ Left side crop', value: 'Apply side crop showing left side of face, maintaining exact framing, keeping everything else the exact same' },
    { label: '➡️ Right side crop', value: 'Apply side crop showing right side of face, maintaining exact framing, keeping everything else the exact same' },
    { label: '🔍 Close-up tight crop', value: 'Apply very tight close-up crop with minimal framing, maintaining exact composition, keeping everything else the exact same' }
  ],
  motion: [
    { label: '💨 Motion blur', value: 'Add motion blur with subtle streaking effect' },
    { label: '🎯 Tack sharp', value: 'Apply sharp focus with crystal clear details' },
    { label: '🌫️ Soft focus', value: 'Apply soft focus with gentle blur and reduced sharpness' }
  ],
  gaze: [
    { label: '👈 Look left', value: 'Have subject looking left, gaze away from camera' },
    { label: '👉 Look right', value: 'Have subject looking right, gaze away from camera' },
    { label: '👁️ Camera gaze', value: 'Subject looking directly at camera with engaged eye contact' },
    { label: '👇 Look down', value: 'Subject looking downward with contemplative gaze' }
  ],
  expression: [
    { label: '😊 Subtle smile', value: 'Add subtle smile with natural warmth' },
    { label: '😢 Melancholic', value: 'Apply melancholic expression with downcast gaze' },
    { label: '😗 Playful pout', value: 'Add playful pout with pursed lips' },
    { label: '😐 Neutral', value: 'Maintain neutral expression with relaxed features' },
    { label: '😮 Subtle surprise', value: 'Show subtle surprise with raised eyebrows' },
    { label: '💪 Confident pose', value: 'Apply confident body language with strong posture' },
    { label: '🤔 Pensive look', value: 'Add pensive expression with contemplative gaze' },
    { label: '😌 Gentle smile', value: 'Apply gentle smile with natural warmth' },
    { label: '😊 Relaxed gaze', value: 'Maintain relaxed gaze with natural expression' }
  ],
  color: [
    { label: '🎨 Muted palette', value: 'Apply muted earth tone palette with desaturated colors' },
    { label: '🌈 Vibrant colors', value: 'Increase color vibrancy and saturation' },
    { label: '⚫ Monochrome', value: 'Convert to black and white with strong tonal contrast' }
  ],
  depth: [
    { label: '📷 Shallow DOF', value: 'Add shallow depth of field with bokeh background blur' },
    { label: '🌄 Deep focus', value: 'Apply deep depth of field with sharp focus throughout' }
  ],
  modifications: [
    { label: '💍 Remove all jewelry', value: 'Remove all jewelry including necklaces, earrings, rings, bracelets, and watches, keeping everything else the exact same' },
    { label: '📿 Remove necklaces', value: 'Remove necklaces and neck jewelry, keeping everything else the exact same' },
    { label: '💎 Remove earrings', value: 'Remove earrings, keeping everything else the exact same' },
    { label: '💍 Remove rings', value: 'Remove rings, keeping everything else the exact same' },
    { label: '⌚ Remove bracelets/watches', value: 'Remove bracelets and watches, keeping everything else the exact same' }
  ],
  clothing: [
    { label: '🔴 Red clothing', value: 'Change clothing color to red, keeping everything else the exact same' },
    { label: '🔵 Blue clothing', value: 'Change clothing color to blue, keeping everything else the exact same' },
    { label: '🟢 Green clothing', value: 'Change clothing color to green, keeping everything else the exact same' },
    { label: '⚫ Black clothing', value: 'Change clothing color to black, keeping everything else the exact same' },
    { label: '⚪ White clothing', value: 'Change clothing color to white, keeping everything else the exact same' },
    { label: '🩷 Pink clothing', value: 'Change clothing color to pink, keeping everything else the exact same' },
    { label: '🟡 Yellow clothing', value: 'Change clothing color to yellow, keeping everything else the exact same' },
    { label: '🟣 Purple clothing', value: 'Change clothing color to purple, keeping everything else the exact same' },
    { label: '🟠 Orange clothing', value: 'Change clothing color to orange, keeping everything else the exact same' },
    { label: '⚪ Gray clothing', value: 'Change clothing color to gray, keeping everything else the exact same' },
    { label: '🔵 Navy clothing', value: 'Change clothing color to navy, keeping everything else the exact same' },
    { label: '🔴 Burgundy clothing', value: 'Change clothing color to burgundy, keeping everything else the exact same' },
    { label: '🔵 Teal clothing', value: 'Change clothing color to teal, keeping everything else the exact same' },
    { label: '🩷 Coral clothing', value: 'Change clothing color to coral, keeping everything else the exact same' },
    { label: '🟤 Beige clothing', value: 'Change clothing color to beige, keeping everything else the exact same' },
    { label: '🔴 Maroon clothing', value: 'Change clothing color to maroon, keeping everything else the exact same' },
    { label: '🟢 Emerald clothing', value: 'Change clothing color to emerald, keeping everything else the exact same' },
    { label: '🔴 Crimson clothing', value: 'Change clothing color to crimson, keeping everything else the exact same' },
    { label: '🟡 Gold clothing', value: 'Change clothing color to gold, keeping everything else the exact same' },
    { label: '⚪ Silver clothing', value: 'Change clothing color to silver, keeping everything else the exact same' }
  ]
}

interface VariantPromptEnhanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPrompt: string
  onPromptUpdated: (newPrompt: string) => void
  imagePaths: string[]
}

export function VariantPromptEnhanceDialog({
  open,
  onOpenChange,
  currentPrompt,
  onPromptUpdated,
  imagePaths
}: VariantPromptEnhanceDialogProps) {
  const [instructions, setInstructions] = useState('')
  const [selectedPresets, setSelectedPresets] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null)
  const [editableEnhancedPrompt, setEditableEnhancedPrompt] = useState('')
  const [step, setStep] = useState<'input' | 'review'>('input')
  const { toast } = useToast()
  
  // Keep track of the latest prompt to avoid stale closures
  const latestPromptRef = useRef(currentPrompt)
  
  // Sync latest prompt ref whenever currentPrompt prop changes
  useEffect(() => {
    latestPromptRef.current = currentPrompt
  }, [currentPrompt])
  
  // Reset state when dialog opens to ensure fresh start
  useEffect(() => {
    if (open) {
      setStep('input')
      setInstructions('')
      setSelectedPresets([])
      setEnhancedPrompt(null)
      setEditableEnhancedPrompt('')
      latestPromptRef.current = currentPrompt
    }
  }, [open, currentPrompt])

  const handleEnhance = async () => {
    if (!instructions.trim()) {
      toast({
        title: "Instructions required",
        description: "Please tell the AI how you want to improve the prompt.",
        variant: "destructive"
      })
      return
    }

    // Get the absolute latest prompt value from ref to avoid stale closures
    const latestPrompt = latestPromptRef.current || currentPrompt
    
    if (!latestPrompt) {
      toast({
        title: "No prompt",
        description: "Please provide a prompt to enhance.",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/variants/prompt/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          existingPrompt: latestPrompt,
          userInstructions: instructions,
          imagePaths
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to enhance prompt')
      }

      setEnhancedPrompt(data.prompt)
      setEditableEnhancedPrompt(data.prompt)
      setStep('review')
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to enhance prompt",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    onPromptUpdated(editableEnhancedPrompt)
    onOpenChange(false)
    toast({
      title: "Prompt updated",
      description: "The enhanced prompt has been applied.",
    })
    
    // Reset for next time
    setStep('input')
    setInstructions('')
    setEnhancedPrompt(null)
  }

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(editableEnhancedPrompt)
    toast({
      title: "Copied",
      description: "Enhanced prompt copied to clipboard",
    })
  }

  const handlePresetToggle = (value: string, label: string) => {
    setSelectedPresets(prev => {
      const isSelected = prev.includes(label)
      return isSelected 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    })
    
    // Update instructions by combining all selected presets
    const currentValues = instructions ? instructions.split('. ').filter(s => s.trim()) : []
    const isCurrentlyIncluded = currentValues.some(v => v.includes(value))
    
    if (isCurrentlyIncluded) {
      // Remove this value
      const filtered = currentValues.filter(v => !v.includes(value))
      setInstructions(filtered.join('. '))
    } else {
      // Add this value
      const combined = [...currentValues, value].join('. ')
      setInstructions(combined)
    }
  }
  
  const clearPresets = () => {
    setSelectedPresets([])
    setInstructions('')
  }

  const handleReset = () => {
    setStep('input')
    setSelectedPresets([])
    setEnhancedPrompt(null)
  }

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open)
    if (!open) {
      // Reset state when closing
      setTimeout(() => {
        setStep('input')
        setInstructions('')
        setSelectedPresets([])
        setEnhancedPrompt(null)
      }, 200)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-3xl !max-h-[90vh] flex flex-col overflow-hidden [&>button]:z-10"
        style={{ maxHeight: '90vh' }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            Enhance Variant Prompt with AI
          </DialogTitle>
          <DialogDescription>
            Give instructions to refine the current variant prompt while keeping the same structure and safety rules.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="grid gap-4 py-2">
            {step === 'input' && (
              <>
                <div className="grid gap-2">
                  <Label>Current Prompt</Label>
                  <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
                    {latestPromptRef.current || currentPrompt}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="instructions">
                    Enhancement Instructions <span className="text-red-500">*</span>
                  </Label>
                  
                  {/* Preset chips - organized by category with multi-select */}
                  <div className="space-y-3 max-h-[300px] overflow-y-auto border rounded-md p-3">
                    {Object.entries(PRESET_ENHANCEMENTS).map(([category, presets]) => (
                      <div key={category} className="space-y-1.5">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{category}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {presets.map((preset) => {
                            const isSelected = selectedPresets.includes(preset.label)
                            return (
                              <button
                                key={preset.label}
                                onClick={() => handlePresetToggle(preset.value, preset.label)}
                                className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
                                  isSelected 
                                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-primary' 
                                    : 'bg-secondary hover:bg-secondary/80'
                                }`}
                                title={preset.value}
                              >
                                {preset.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Clear selections */}
                  {selectedPresets.length > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{selectedPresets.length} preset{selectedPresets.length > 1 ? 's' : ''} selected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearPresets}
                        className="h-7 px-2"
                      >
                        Clear all
                      </Button>
                    </div>
                  )}
                  
                  <Textarea
                    id="instructions"
                    placeholder="Combined instructions from selected presets (or type custom)..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={4}
                    className="resize-y max-h-[200px] overflow-y-auto font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select multiple presets to combine effects. The AI will analyze your images and adjust the prompt accordingly with Seedream v4 principles.
                  </p>
                </div>
              </>
            )}

            {step === 'review' && (
              <div className="grid gap-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="grid gap-2 min-w-0">
                    <Label className="text-muted-foreground">Original</Label>
                    <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground max-h-[400px] min-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
                      {latestPromptRef.current || currentPrompt}
                    </div>
                  </div>
                  <div className="grid gap-2 min-w-0">
                    <Label className="text-purple-600 font-medium flex items-center gap-2">
                      <Sparkles className="h-3 w-3" /> Enhanced Result
                    </Label>
                    <Textarea
                      value={editableEnhancedPrompt}
                      onChange={(e) => setEditableEnhancedPrompt(e.target.value)}
                      className="max-h-[400px] min-h-[200px] text-sm resize-y overflow-y-auto"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0 border-t pt-4 mt-4">
          {step === 'input' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleEnhance} 
                disabled={isLoading || !instructions.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enhancing...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Enhance Prompt
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'review' && (
            <div className="flex flex-col sm:flex-row w-full justify-between gap-2">
              <Button variant="ghost" onClick={handleReset} className="mr-auto">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyToClipboard}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button onClick={handleApply} className="bg-green-600 hover:bg-green-700">
                  <Check className="mr-2 h-4 w-4" />
                  Apply Prompt
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

