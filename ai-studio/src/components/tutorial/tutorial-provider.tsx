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
      content: 'Select Create Model to begin.',
      disableBeacon: true,
    },
  ],
  '/models/new': [
    {
      target: '[data-tour="new-model-headshot"]',
      content: 'Add your best picture of the model\'s face here. Don\'t worry, you can add more later (even outfit items).',
      disableBeacon: true,
    },
    {
      target: '[data-tour="new-model-name"], #name',
      content: 'Add a name for your model.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="new-model-submit"]',
      content: 'Then select Create to finish your model.',
      disableBeacon: true,
    },
  ],
  '/models': [
    {
      target: '[data-tour="models-item"]',
      content: 'Open your model to enter the generation workspace.',
      disableBeacon: true,
    },
  ],
  '/models/[modelId]': [
    {
      target: '[data-tour="workspace-dimensions"]',
      content: 'This is where you can change the dimensions of your output photo.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="workspace-bulk-upload"]',
      content: 'You can upload an image or drag and drop a folder of images here.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="workspace-face-swap"]',
      content: 'When both images are present select the face swap. This will generate a prompt.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="workspace-generate"]',
      content: 'Click Generate to create images.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="workspace-prompt"]',
      content: 'Tweak the prompt if anything is wrong with the image. If it\'s close, try Generate again.',
      disableBeacon: true,
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
      setTimeout(() => setRun(true), 50)
    }
  }, [localEnabled, manualDisabled, pathname, currentSteps.length])

  // Listen for global toggle events to immediately stop/start the tutorial
  useEffect(() => {
    const onToggle = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>
      const enabled = Boolean(custom.detail?.enabled)
      setManualDisabled(!enabled)
      setLocalEnabled(enabled)
      if (!enabled) {
        // Stop immediately
        setRun(false)
        setStepIndex(0)
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
          // Toggle run to ensure Joyride initializes the first step
          setRun(false)
          setTimeout(() => setRun(true), 50)
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
      setTimeout(() => setRun(true), 50)
    }
  }, [tourEnabled, manualDisabled, pathname, currentSteps.length])

  // Reset step index when route changes
  useEffect(() => {
    const routeChanged = previousPathname.current !== pathname
    previousPathname.current = pathname
    
    if (shouldRun && currentSteps.length > 0) {
      if (routeChanged) {
        setStepIndex(0)
        // Reset target-not-found retries on navigation
        targetRetryRef.current = { route: currentRoute, index: 0, retries: 0 }
        // Briefly pause and resume to ensure DOM is ready
        setRun(false)
        setTimeout(() => setRun(true), 250)
      } else {
        setRun(true)
      }
    } else {
      setRun(false)
    }
  }, [pathname, shouldRun, currentSteps.length])

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
      
      // Advance to next step (only if not navigating)
      if (index < currentSteps.length - 1) {
        setStepIndex(index + 1)
      }
    }
  }, [pathname, currentRoute, currentSteps, router, setTourEnabled])

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
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  return (
    <NuqsAdapter>
      <TutorialProviderInner>{children}</TutorialProviderInner>
    </NuqsAdapter>
  )
}

