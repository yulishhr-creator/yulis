import type { LucideIcon } from 'lucide-react'

/** Accent tokens from Stitch HTML export (Dashboard - Light Theme, project HR Task Navigator). */
const VARIANTS = {
  green: {
    bar: '#b4fdb4',
    label: '#165c25',
    footer: '#246830',
  },
  terracotta: {
    bar: '#fd8863',
    label: '#8b3315',
    footer: '#9b3e20',
  },
  blue: {
    bar: '#97daff',
    label: '#004d68',
    footer: '#006384',
  },
  danger: {
    bar: '#fb5151',
    label: '#9f0519',
    footer: '#b31b25',
  },
} as const

export type StitchKpiVariant = keyof typeof VARIANTS

type StitchKpiCardProps = {
  label: string
  value: string | number
  footer: string
  icon: LucideIcon
  variant: StitchKpiVariant
}

/**
 * Mobile-first stat tile matching Stitch: white card, soft shadow, thick colored bottom bar, Manrope label, Plus Jakarta value.
 */
export function StitchKpiCard({ label, value, footer, icon: Icon, variant }: StitchKpiCardProps) {
  const v = VARIANTS[variant]
  return (
    <article
      className="flex flex-col justify-between rounded-2xl border-0 border-b-4 bg-white p-6 shadow-[0_20px_40px_rgba(48,46,43,0.06)] md:rounded-3xl md:p-8 dark:bg-stone-900 dark:shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
      style={{ borderBottomColor: v.bar }}
    >
      <div>
        <span
          className="font-stitch-label mb-1 block text-xs font-bold tracking-[0.2em] uppercase"
          style={{ color: v.label }}
        >
          {label}
        </span>
        <p className="font-stitch-head text-stitch-on-surface text-4xl font-extrabold tracking-tight tabular-nums dark:text-stone-100">
          {value}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: v.footer }}>
        <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
        <span>{footer}</span>
      </div>
    </article>
  )
}
