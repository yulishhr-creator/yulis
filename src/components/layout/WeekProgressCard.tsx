import { sidebarDailyPhrase } from '@/lib/sidebarDailyPhrases'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

function weekTowardFriday(now: Date) {
  const d = now.getDay()
  const phrase = sidebarDailyPhrase(now)
  // Sun–Fri → 1/6 … 6/6 toward Friday; Saturday → weekend copy
  if (d === 6) {
    return {
      step: 0,
      total: 6,
      dayIndex: d,
      phrase,
      sub: 'Weekend — see you Monday.',
      fillRatio: 1,
    }
  }
  const step = d === 0 ? 1 : d + 1
  return {
    step,
    total: 6,
    dayIndex: d,
    phrase,
    sub: `${step}/6 toward Friday`,
    fillRatio: step / 6,
  }
}

/** Week progress toward Friday — sits under Quick actions in the sidebar. */
export function WeekProgressCard() {
  const now = new Date()
  const { step, total, dayIndex, phrase, sub, fillRatio } = weekTowardFriday(now)
  const markerCenterPct = ((dayIndex + 0.5) / 7) * 100

  return (
    <div className="border-line border-t p-3 pb-4 dark:border-line-dark">
      <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-b from-white to-orange-50/30 px-3 pt-4 pb-4 shadow-md shadow-orange-200/25 dark:border-stone-600/80 dark:from-stone-900 dark:to-violet-950/40 dark:shadow-violet-950/20">
        <div className="mb-1 grid grid-cols-7">
          {DAYS.map((_, i) => (
            <div key={i} className="flex justify-center" aria-hidden>
              <div className="h-1.5 w-px bg-stone-200 dark:bg-stone-600" />
            </div>
          ))}
        </div>

        <div className="relative w-full pt-1 pb-0.5" role="presentation">
          <div
            className="pointer-events-none absolute z-10 h-4 w-0.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#fd8863] to-[#9b3e20] shadow-sm dark:from-orange-400 dark:to-orange-700"
            style={{ left: `${markerCenterPct}%`, top: '0' }}
            aria-hidden
          />
          <div
            className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`${step} of ${total} toward Friday`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6b2f22] via-[#fd8863] to-[#7ec8e3] transition-[width] duration-500 ease-out dark:from-[#5c261c] dark:via-orange-500 dark:to-cyan-400/90"
              style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-0 text-center">
          {DAYS.map((label, i) => (
            <span
              key={label}
              className={`text-[9px] font-bold tracking-tight text-ink-muted dark:text-stone-500 ${
                i === dayIndex ? 'opacity-100' : 'opacity-80'
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        <p className="text-ink mt-3 text-center text-xs font-semibold leading-snug dark:text-stone-100">{phrase}</p>
        <p className="text-ink-muted mt-1.5 text-center text-[11px] font-medium dark:text-stone-400">{sub}</p>
      </div>
    </div>
  )
}
