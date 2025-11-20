'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryState, parseAsBoolean } from 'nuqs'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride'

interface TutorialProviderProps {
  children: React.ReactNode
}

// Define steps for each route
const stepsByRoute: Record<string, Step[]> = {
  '/dashboard': [
    {
      target: '[data-tour="dashboard-create-model"]',
      content: 'Welcome to AI Studio! Click "New Model" to start creating your first AI model.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
  ],
  '/models/new': [
    {
      target: '[data-tour="new-model-headshot"]',
      content: 'First, add a headshot image of your model. This will be used as the reference face.',
      disableBeacon: true,
      placement: 'right' as const,
    },
    {
      target: '[data-tour="new-model-name"]',
      content: 'Give your model a name so you can easily identify it later.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
    {
      target: '[data-tour="new-model-submit"]',
      content: 'Once you\'ve added the headshot and name, click "Create Model" to finish.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
  ],
  '/models': [
    {
      target: '[data-tour="models-item"]',
      content: 'Click on your model to open the generation workspace where you can create images.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
  ],
  '/models/[modelId]': [
    {
      target: '[data-tour="workspace-dimensions"]',
      content: 'Here you can adjust the output dimensions for your generated images.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
    {
      target: '[data-tour="workspace-bulk-upload"]',
      content: 'Upload target images here - these are the outfits/scenes you want to apply the face to.',
      disableBeacon: true,
      placement: 'left' as const,
    },
    {
      target: '[data-tour="workspace-face-swap"]',
      content: 'Click "Face Swap" to generate a prompt that will swap the face onto the target image.',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
    {
      target: '[data-tour="workspace-generate"]',
      content: 'Finally, click "Generate" to create your AI-generated images!',
      disableBeacon: true,
      placement: 'bottom' as const,
    },
    {
      target: '[data-tour="workspace-prompt"]',
      content: 'You can edit the prompt here to fine-tune your results. That\'s it - you\'re ready to create!',
      disableBeacon: true,
      placement: 'top' as const,
    },
  ],
}

// Helper to match route patterns
function matchRoute(pathname: string): string | null {
  // Exact matches first
  if (stepsByRoute[pathname]) {
    return pathname
  }
  
  // Pattern matches
  if (pathname.startsWith('/models/') && pathname !== '/models/new') {
    return '/models/[modelId]'
  }
  
  return null
}

function TutorialProviderInner({ children }: TutorialProviderProps) {
  // Tutorial mode is disabled - always return children without tutorial functionality
  // This prevents bugs where new users can't turn it off and it constantly refreshes the app
  return <>{children}</>
  
  /* Tutorial functionality disabled - kept for future reference
  const pathname = usePathname()
  const router = useRouter()
  const [tourEnabled, setTourEnabled] = useQueryState('tour', parseAsBoolean.withDefault(false))
  
  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [tutorialEnabledFromDB, setTutorialEnabledFromDB] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const previousPathname = useRef(pathname)
  const targetRetryRef = useRef<{ route: string | null; index: number; retries: number }>({ route: null, index: 0, retries: 0 })
  const [manualDisabled, setManualDisabled] = useState(false)
  const [localEnabled, setLocalEnabled] = useState(false)
  const [runNonce, setRunNonce] = useState(0)

  // Load persisted disabled state
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-studio:tutorial-disabled')
      if (stored === '1') {
        setManualDisabled(true)
        setLocalEnabled(false)
        setTourEnabled(false)
      }
    } catch {
      // no-op
    }
  }, [setTourEnabled])

  // Fetch tutorial enabled state from API
  useEffect(() => {
    async function fetchTutorialEnabled() {
      try {
        const response = await fetch('/api/user/settings')
        if (response.ok) {
          const data = await response.json()
          setTutorialEnabledFromDB(data.tutorial_enabled ?? false)
        }
      } catch (error) {
        console.error('Failed to fetch tutorial settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchTutorialEnabled()
  }, [])

  // Determine if tutorial should run
  const shouldRun = (!isLoading || localEnabled) && !manualDisabled && (tutorialEnabledFromDB || tourEnabled || localEnabled)

  // Get current route's steps
  const currentRoute = matchRoute(pathname)
  const currentSteps = currentRoute ? stepsByRoute[currentRoute] : []

  // Ensure immediate start on dashboard when toggled on locally
  useEffect(() => {
    if (localEnabled && !manualDisabled && pathname === '/dashboard' && currentSteps.length > 0) {
      setStepIndex(0)
      setRunNonce(n => n + 1)
      setRun(false)
      // Wait for target element
      const waitForTarget = () => {
        const target = document.querySelector('[data-tour="dashboard-create-model"]')
        if (target) {
          setRun(true)
        } else {
          setTimeout(waitForTarget, 100)
        }
      }
      setTimeout(waitForTarget, 300)
    }
  }, [localEnabled, manualDisabled, pathname, currentSteps.length])

  // Listen for global toggle events to immediately stop/start the tutorial
  useEffect(() => {
    const onToggle = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>
      const enabled = Boolean(custom.detail?.enabled)
      setManualDisabled(!enabled)
      setLocalEnabled(enabled)
      try {
        localStorage.setItem('ai-studio:tutorial-disabled', enabled ? '0' : '1')
      } catch {
        // no-op
      }
      if (!enabled) {
        // Stop immediately
        setRun(false)
        setStepIndex(0)
        try {
          const params = new URLSearchParams(window.location.search)
          params.delete('tour')
          const next = `${pathname}${params.size ? `?${params.toString()}` : ''}`
          router.replace(next)
        } catch {
          // no-op
        }
      } else if (enabled) {
        // Start from dashboard immediately
        const suffix = '?tour=1'
        if (pathname !== '/dashboard') {
          try {
            router.push(`/dashboard${suffix}`)
          } catch {
            // no-op
          }
        } else {
          setStepIndex(0)
          targetRetryRef.current = { route: '/dashboard', index: 0, retries: 0 }
          setRunNonce(n => n + 1)
          setRun(false)
          // Wait for target element
          const waitForTarget = () => {
            const target = document.querySelector('[data-tour="dashboard-create-model"]')
            if (target) {
              setRun(true)
            } else {
              setTimeout(waitForTarget, 100)
            }
          }
          setTimeout(waitForTarget, 300)
        }
      }
    }
    window.addEventListener('ai-studio:tutorial-toggle', onToggle as EventListener)
    return () => {
      window.removeEventListener('ai-studio:tutorial-toggle', onToggle as EventListener)
    }
  }, [tutorialEnabledFromDB, tourEnabled, pathname, router])

  // When tutorial is enabled from DB (e.g. persisted between sessions), ensure we begin on the dashboard
  useEffect(() => {
    if (isLoading) return
    if (manualDisabled) return
    if (!tutorialEnabledFromDB) return
    // Avoid interfering when explicitly enabled locally or via URL param
    if (localEnabled || tourEnabled) return
    if (pathname !== '/dashboard') {
      try {
        router.push('/dashboard?tour=1')
      } catch {
        // no-op
      }
    }
  }, [isLoading, manualDisabled, tutorialEnabledFromDB, localEnabled, tourEnabled, pathname, router])

  // Start immediately on dashboard when tour param flips to true (in case event is missed)
  useEffect(() => {
    if (tourEnabled && !manualDisabled && pathname === '/dashboard' && currentSteps.length > 0) {
      setStepIndex(0)
      setRunNonce(n => n + 1)
      setRun(false)
      // Wait for target element
      const waitForTarget = () => {
        const target = document.querySelector('[data-tour="dashboard-create-model"]')
        if (target) {
          setRun(true)
        } else {
          setTimeout(waitForTarget, 100)
        }
      }
      setTimeout(waitForTarget, 300)
    }
  }, [tourEnabled, manualDisabled, pathname, currentSteps.length])

  // Redirect to dashboard when tutorial starts (if not already there)
  useEffect(() => {
    const running = (tourEnabled || localEnabled) && !manualDisabled
    if (!running) return
    
    // Only redirect to dashboard if we're starting fresh and not on a valid tutorial page
    const onValidTutorialPage = matchRoute(pathname) !== null
    if (!onValidTutorialPage && pathname !== '/dashboard') {
      try {
        router.replace('/dashboard?tour=1')
      } catch {
        // no-op
      }
    }
  }, [tourEnabled, localEnabled, manualDisabled, pathname, router])

  // Reset step index when route changes and wait for DOM
  useEffect(() => {
    const routeChanged = previousPathname.current !== pathname
    previousPathname.current = pathname
    
    if (shouldRun && currentSteps.length > 0) {
      if (routeChanged) {
        setStepIndex(0)
        // Reset target-not-found retries on navigation
        targetRetryRef.current = { route: currentRoute, index: 0, retries: 0 }
      }
      
      // Get the target selector for the first step
      const firstStepTarget = currentSteps[0]?.target
      if (!firstStepTarget) {
        setRun(false)
        return
      }
      
      // Wait for target element to be mounted
      let attempts = 0
      const maxAttempts = 30 // 3 seconds max wait
      const checkAndStart = () => {
        const target = document.querySelector(firstStepTarget as string)
        if (target) {
          setRun(true)
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(checkAndStart, 100)
        } else {
          // Target not found after timeout, stop tutorial
          console.warn('Tutorial target not found:', firstStepTarget)
          setRun(false)
        }
      }
      
      // Initial delay to let React render
      setTimeout(checkAndStart, 300)
    } else {
      setRun(false)
    }
  }, [pathname, shouldRun, currentSteps, currentRoute])

  // Handle step callbacks
  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, type, index, action } = data

    // If manually disabled or not supposed to run, ignore further actions
    if (manualDisabled || !shouldRun) {
      setRun(false)
      return
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      setStepIndex(0)
      setLocalEnabled(false)
      
      // Update DB to disable tutorial
      if (status === STATUS.SKIPPED || status === STATUS.FINISHED) {
        fetch('/api/user/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorial_enabled: false }),
        }).catch(console.error)
        
        setTourEnabled(false)
        setManualDisabled(true)
        try {
          localStorage.setItem('ai-studio:tutorial-disabled', '1')
        } catch {
          // no-op
        }
        // Remove ?tour from URL
        try {
          const params = new URLSearchParams(window.location.search)
          params.delete('tour')
          const next = `${pathname}${params.size ? `?${params.toString()}` : ''}`
          router.replace(next)
        } catch {
          // no-op
        }
      }
      return
    }

    // Handle explicit close
    if (action === 'close') {
      setRun(false)
      setStepIndex(0)
      setLocalEnabled(false)
      fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorial_enabled: false }),
      }).catch(console.error)
      setTourEnabled(false)
      setManualDisabled(true)
      try {
        localStorage.setItem('ai-studio:tutorial-disabled', '1')
      } catch {
        // no-op
      }
      // Remove ?tour from URL
      try {
        const params = new URLSearchParams(window.location.search)
        params.delete('tour')
        const next = `${pathname}${params.size ? `?${params.toString()}` : ''}`
        router.replace(next)
      } catch {
        // no-op
      }
      return
    }

    // Retry when target isn't ready yet (after navigation/render)
    if (type === 'error') {
      const keyRoute = currentRoute
      const retryState = targetRetryRef.current
      if (retryState.route !== keyRoute || retryState.index !== index) {
        targetRetryRef.current = { route: keyRoute, index, retries: 0 }
      }
      if (retryState.retries < 20) {
        retryState.retries += 1
        // Toggle run to force re-evaluation
        setRun(false)
        setTimeout(() => setRun(true), 300)
        return
      }
      // Give up after retries and just continue
    }

    // Handle step navigation
    if (type === 'step:after' && currentSteps.length > 0) {
      // Navigate based on current route and step
      if (pathname === '/dashboard' && index === 0) {
        // After dashboard step, navigate to /models/new
        setTimeout(() => {
          const suffix = (tourEnabled || localEnabled) && !manualDisabled ? '?tour=1' : ''
          router.push(`/models/new${suffix}`)
        }, 300)
        return // Don't advance step index, let route change handle it
      } else if (pathname === '/models/new' && index === currentSteps.length - 1) {
        // After the last step on new model, navigate to /models
        setTimeout(() => {
          const suffix = (tourEnabled || localEnabled) && !manualDisabled ? '?tour=1' : ''
          router.push(`/models${suffix}`)
        }, 300)
        return // Don't advance step index, let route change handle it
      } else if (pathname === '/models' && index === 0) {
        // After models list step, try to click first model link
        setTimeout(() => {
          const firstModelLink = document.querySelector('[data-tour="models-item"]') as HTMLAnchorElement
          if (firstModelLink) {
            try {
              const url = new URL(firstModelLink.href, window.location.origin)
              if ((tourEnabled || localEnabled) && !manualDisabled) {
                url.searchParams.set('tour', '1')
              } else {
                url.searchParams.delete('tour')
              }
              window.location.assign(url.toString())
            } catch {
              firstModelLink.click()
            }
          } else {
            // If no models, keep step active
            console.warn('No model found to navigate to')
          }
        }, 300)
        return // Don't advance step index, let route change handle it
      } else if (currentRoute === '/models/[modelId]' && index === 1) {
        // After bulk upload step, programmatically click add row button
        setTimeout(() => {
          const addRowButton = document.querySelector('[data-tour="workspace-add-row"]') as HTMLButtonElement
          if (addRowButton) {
            addRowButton.click()
          }
        }, 300)
        // Wait until the next target exists before advancing to step 3 (face swap)
        const start = Date.now()
        const waitForFaceSwap = () => {
          const el = document.querySelector('[data-tour="workspace-face-swap"]')
          if (el) {
            setStepIndex(index + 1)
            return
          }
          if (Date.now() - start < 10000) {
            setTimeout(waitForFaceSwap, 250)
          } else {
            // Timeout fallback: advance anyway
            setStepIndex(index + 1)
          }
        }
        setTimeout(waitForFaceSwap, 350)
        return
      }
      
      // Advance to next step (if not navigating)
      if (index < currentSteps.length - 1) {
        setStepIndex(index + 1)
      }
    }
  }, [pathname, currentRoute, currentSteps, router, setTourEnabled])

  // Failsafe: if overlay appears but tooltip doesn't, exit to avoid dark page lock
  useEffect(() => {
    if (!run) return
    const timer = setTimeout(() => {
      try {
        const hasOverlay = !!document.querySelector('.react-joyride__overlay')
        const hasTooltip =
          !!document.querySelector('.react-joyride__tooltip') ||
          !!document.querySelector('[data-test-id="react-joyride-tooltip"]')
        if (hasOverlay && !hasTooltip) {
          setRun(false)
          setStepIndex(0)
          setLocalEnabled(false)
          setManualDisabled(true)
          setTourEnabled(false)
          try {
            localStorage.setItem('ai-studio:tutorial-disabled', '1')
          } catch {}
          try {
            fetch('/api/user/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tutorial_enabled: false }),
            }).catch(() => {})
            const params = new URLSearchParams(window.location.search)
            params.delete('tour')
            const next = `${pathname}${params.size ? `?${params.toString()}` : ''}`
            router.replace(next)
          } catch {}
        }
      } catch {
        // no-op
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [run, stepIndex, pathname, router, setTourEnabled])

  // Don't render if loading and not locally enabled, or no steps/shouldn't run
  if ((isLoading && !localEnabled) || !shouldRun || !currentSteps.length) {
    return <>{children}</>
  }

  return (
    <>
      {children}
      <Joyride
        key={`${currentRoute}-${stepIndex}-${runNonce}`}
        steps={currentSteps}
        run={run}
        stepIndex={stepIndex}
        spotlightPadding={8}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        spotlightClicks
        disableScrolling
        scrollToFirstStep
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: 'hsl(var(--primary))',
            zIndex: 10000,
          },
          tooltip: {
            borderRadius: '8px',
            zIndex: 12000,
          },
          overlay: {
            zIndex: 10000,
          },
          spotlight: {
            zIndex: 12000,
          },
          buttonNext: {
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
          },
          buttonBack: {
            color: 'hsl(var(--foreground))',
          },
        }}
        locale={{
          back: 'Back',
          close: 'Close',
          last: 'Finish',
          next: 'Next',
          skip: 'Skip',
        }}
      />
    </>
  )
  */
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  return (
    <NuqsAdapter>
      <TutorialProviderInner>{children}</TutorialProviderInner>
    </NuqsAdapter>
  )
}

