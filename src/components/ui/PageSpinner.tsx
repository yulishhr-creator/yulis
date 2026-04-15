import { Loader2 } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'

type PageSpinnerProps = {
  message?: string
  className?: string
}

/** Centered loading state for full-width page sections (replaces plain “Loading…” copy). */
export function PageSpinner({ message = 'Loading…', className = '' }: PageSpinnerProps) {
  const reduceMotion = useReducedMotion()
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 py-14 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="relative flex h-14 w-14 items-center justify-center">
        {!reduceMotion ? (
          <span
            className="absolute inset-0 animate-ping rounded-full bg-[#fd8863]/20 dark:bg-orange-500/15"
            style={{ animationDuration: '1.8s' }}
            aria-hidden
          />
        ) : null}
        <span className="absolute inset-1 rounded-full border-2 border-[#9b3e20]/30 dark:border-orange-400/35" aria-hidden />
        <Loader2
          className={`relative h-8 w-8 text-[#9b3e20] dark:text-orange-400 ${reduceMotion ? '' : 'animate-spin'}`}
          aria-hidden
        />
      </span>
      <p className="text-ink-muted text-sm font-semibold tracking-wide dark:text-stone-400">{message}</p>
    </div>
  )
}
