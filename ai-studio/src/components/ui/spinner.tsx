import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6', 
  lg: 'h-8 w-8'
}

export function Spinner({ className, size = 'sm' }: SpinnerProps) {
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    let animationId: number
    let startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const newRotation = (elapsed / 1500) * 360 // 1.5 seconds per full rotation
      setRotation(newRotation % 360)
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [])

  return (
    <Loader2 
      className={cn(
        sizeClasses[size],
        '!pointer-events-auto', // Override button's pointer-events-none
        className
      )}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center',
        pointerEvents: 'auto'
      }}
      aria-hidden="true"
    />
  )
}
