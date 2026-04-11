import { clsx } from 'clsx'

type AppLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
  className?: string
}

const sizes = {
  sm: { mark: 'h-8 w-8', text: 'text-base' },
  md: { mark: 'h-10 w-10', text: 'text-lg' },
  lg: { mark: 'h-14 w-14', text: 'text-2xl' },
} as const

/** Stylized “Y” mark + optional wordmark */
export function AppLogo({ size = 'md', showWordmark = true, className }: AppLogoProps) {
  const s = sizes[size]
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <div
        className={clsx(
          s.mark,
          'shadow-accent/25 flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-[var(--color-accent)] to-amber-800 shadow-lg ring-2 ring-white/30 dark:ring-white/10',
        )}
        aria-hidden
      >
        <span className="text-stone-50 text-2xl font-bold tracking-tight">Y</span>
      </div>
      {showWordmark ? (
        <div className="min-w-0">
          <p className={clsx('text-ink leading-tight font-semibold tracking-tight dark:text-stone-100', s.text)}>
            Yuli’s HR
          </p>
          <p className="text-ink-muted text-[10px] font-semibold tracking-[0.2em] uppercase dark:text-stone-400">
            Outsmart
          </p>
        </div>
      ) : null}
    </div>
  )
}
