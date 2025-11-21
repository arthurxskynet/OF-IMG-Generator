'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Wand2, Copy, ArrowRight, Check, RefreshCw, Sparkles } from 'lucide-react'

interface PromptEnhanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowId: string
  currentPrompt: string
  onPromptUpdated: (newPrompt: string) => void
  swapMode?: 'face' | 'face-hair'
}

interface PromptJobStatus {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  enhancedPrompt?: string
  error?: string
  estimatedWaitTime?: number
}

export function PromptEnhanceDialog({
  open,
  onOpenChange,
  rowId,
  currentPrompt,
  onPromptUpdated,
  swapMode = 'face-hair'
}: PromptEnhanceDialogProps) {
  const [instructions, setInstructions] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null)
  const [editableEnhancedPrompt, setEditableEnhancedPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'input' | 'processing' | 'review'>('input')
  const { toast } = useToast()

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open && step === 'review' && !enhancedPrompt) {
      setStep('input')
    }
    if (!open) {
      // Optional: could reset completely here, but keeping state might be nice if they accidentally close
    }
  }, [open, step, enhancedPrompt])

  // Poll for job status
  useEffect(() => {
    if (!jobId || step !== 'processing') return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/prompt/queue/${jobId}`)
        if (!response.ok) {
          throw new Error('Failed to poll enhancement status')
        }

        const data: PromptJobStatus = await response.json()

        if (data.status === 'completed' && data.enhancedPrompt) {
          setEnhancedPrompt(data.enhancedPrompt)
          setEditableEnhancedPrompt(data.enhancedPrompt)
          setStep('review')
          setJobId(null) // Stop polling
        } else if (data.status === 'failed') {
          setError(data.error || 'Enhancement failed')
          setStep('input')
          setJobId(null) // Stop polling
          toast({
            title: "Enhancement failed",
            description: data.error || "Something went wrong while enhancing the prompt.",
            variant: "destructive"
          })
        }
      } catch (err) {
        console.error('Polling error:', err)
        // Don't stop polling on transient network errors, but maybe limit retries?
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [jobId, step, toast])

  const handleEnhance = async () => {
    if (!instructions.trim()) {
      toast({
        title: "Instructions required",
        description: "Please tell the AI how you want to improve the prompt.",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/prompt/enhance/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowId,
          existingPrompt: currentPrompt,
          userInstructions: instructions,
          swapMode
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start enhancement')
      }

      setJobId(data.promptJobId)
      setStep('processing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start enhancement')
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start enhancement",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = async () => {
    try {
      setIsLoading(true)
      // Save to row via API
      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt_override: editableEnhancedPrompt
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save enhanced prompt')
      }

      onPromptUpdated(editableEnhancedPrompt)
      onOpenChange(false)
      toast({
        title: "Prompt updated",
        description: "The enhanced prompt has been saved.",
      })
      
      // Reset for next time
      setStep('input')
      setInstructions('')
      setEnhancedPrompt(null)
    } catch (err) {
      toast({
        title: "Save failed",
        description: "Could not save the enhanced prompt to the row.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(editableEnhancedPrompt)
    toast({
      title: "Copied",
      description: "Enhanced prompt copied to clipboard",
    })
  }

  const handleReset = () => {
    setStep('input')
    setEnhancedPrompt(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl !max-h-[90vh] flex flex-col overflow-hidden [&>button]:z-10"
        style={{ maxHeight: '90vh' }}
      >
        <DialogHeader className="flex-shrink-0 pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Wand2 className="h-5 w-5 text-purple-500" />
            Enhance Prompt with AI
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            Give instructions to refine the current prompt while keeping the same structure and safety rules.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="grid gap-6 py-2">
              {step === 'input' && (
                <>
                  <div className="grid gap-3">
                    <Label className="text-sm font-semibold">Current Prompt</Label>
                    <div className="rounded-lg border-2 border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 p-4 text-sm text-muted-foreground max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words font-mono shadow-sm">
                      {currentPrompt}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <Label htmlFor="instructions" className="text-sm font-semibold">
                      Enhancement Instructions <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="instructions"
                      placeholder="E.g. Make the lighting more dramatic and cinematic. Change the outfit to a red evening gown. Make the mood happier."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={4}
                      className="resize-y max-h-[200px] overflow-y-auto border-2 border-border/50 bg-background hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 shadow-sm hover:shadow-md focus-visible:shadow-lg transition-all duration-200"
                    />
                    <p className="text-xs text-muted-foreground">
                      The AI will preserve identity and Seedream format.
                    </p>
                  </div>
                </>
              )}

              {step === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-purple-200 opacity-75 h-16 w-16"></div>
                    <div className="relative flex items-center justify-center bg-purple-100 rounded-full h-16 w-16">
                      <Sparkles className="h-8 w-8 text-purple-600 animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">Enhancing Prompt...</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                      Grok is analyzing your images and instructions to craft the perfect description.
                    </p>
                  </div>
                </div>
              )}

              {step === 'review' && (
                <div className="grid gap-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="grid gap-3 min-w-0">
                      <Label className="text-sm font-semibold text-muted-foreground">Original</Label>
                      <div className="rounded-lg border-2 border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 p-4 text-xs text-muted-foreground max-h-[400px] min-h-[200px] overflow-y-auto whitespace-pre-wrap break-words font-mono shadow-sm">
                        {currentPrompt}
                      </div>
                    </div>
                    <div className="grid gap-3 min-w-0">
                      <Label className="text-sm font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> Enhanced Result
                      </Label>
                      <Textarea
                        value={editableEnhancedPrompt}
                        onChange={(e) => setEditableEnhancedPrompt(e.target.value)}
                        className="max-h-[400px] min-h-[200px] text-sm resize-y overflow-y-auto border-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20 focus-visible:border-purple-500 focus-visible:ring-purple-500/20 shadow-sm hover:shadow-md focus-visible:shadow-lg transition-all duration-200"
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
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
                    Queueing...
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

          {step === 'processing' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close (Run in Background)
            </Button>
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
                <Button onClick={handleApply} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Replace Prompt
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

