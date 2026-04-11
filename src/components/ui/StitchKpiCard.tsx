import type { LucideIcon } from 'lucide-react'

/** Colored bottom bar only (text uses global ink colors). */
const VARIANTS = {
  green: { bar: '#b4fdb4' },
  terracotta: { bar: '#fd8863' },
  blue: { bar: '#97daff' },
  danger: { bar: '#fb5151' },
} as const

export type StitchKpiVariant = keyof typeof VARIANTS

type StitchKpiCardProps = {
  label: string
  value: string | number
  footer: string
  icon: LucideIcon
  variant: StitchKpiVariant
}

/** Mobile-first stat tile: white card, soft shadow, thick colored bottom bar (decorative only). */
export function StitchKpiCard({ label, value, footer, icon: Icon, variant }: StitchKpiCardProps) {
  const v = VARIANTS[variant]
  return (
    <article
      className="flex flex-col justify-between rounded-2xl border-0 border-b-4 bg-white p-6 shadow-[0_20px_40px_rgba(48,46,43,0.06)] md:rounded-3xl md:p-8 dark:bg-stone-900 dark:shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
      style={{ borderBottomColor: v.bar }}
    >
      <div>
        <span className="text-ink-muted mb-1 block text-xs font-bold tracking-[0.2em] uppercase dark:text-stone-400">
          {label}
        </span>
        <p className="text-stitch-on-surface text-4xl font-extrabold tracking-tight tabular-nums dark:text-stone-100">
          {value}
        </p>
      </div>
      <div className="text-ink-muted mt-4 flex items-center gap-1.5 text-sm font-semibold dark:text-stone-400">
        <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
        <span>{footer}</span>
      </div>
    </article>
  )
}
