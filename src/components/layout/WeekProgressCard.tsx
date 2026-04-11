const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

function weekTowardFriday() {
  const d = new Date().getDay()
  // Sun–Fri → 1/6 … 6/6 toward Friday; Saturday → weekend copy
  if (d === 6) {
    return {
      step: 0,
      total: 6,
      dayIndex: d,
      headline: 'WE MADE IT',
      sub: 'Weekend — touch grass (or don’t)',
      fillRatio: 1,
    }
  }
  const step = d === 0 ? 1 : d + 1
  const headlines = [
    'WHY GOD WHY?!',
    'WHY GOD WHY?!',
    'WHY GOD WHY?!',
    'WHY GOD WHY?!',
    'WHY GOD WHY?!',
    'FRIDAY IS CALLING',
  ]
  return {
    step,
    total: 6,
    dayIndex: d,
    headline: headlines[step - 1] ?? 'WHY GOD WHY?!',
    sub: `${step}/6 toward Friday`,
    fillRatio: step / 6,
  }
}

/** Humorous week progress toward Friday — sits under Quick actions in the sidebar. */
export function WeekProgressCard() {
  const { step, total, dayIndex, headline, sub, fillRatio } = weekTowardFriday()
  const markerCenterPct = ((dayIndex + 0.5) / 7) * 100

  return (
    <div className="border-line border-t p-3 dark:border-line-dark">
      <div className="rounded-2xl border border-stone-200/90 bg-white px-3 pt-3 pb-3.5 shadow-md shadow-stone-200/50 dark:border-stone-600/80 dark:bg-stone-900/90 dark:shadow-black/30">
        <div className="mb-1 grid grid-cols-7">
          {DAYS.map((_, i) => (
            <div key={i} className="flex justify-center" aria-hidden>
              <div className="h-1.5 w-px bg-stone-200 dark:bg-stone-600" />
            </div>
          ))}
        </div>

        <div className="relative w-full overflow-visible" role="presentation">
          <div
            className="pointer-events-none absolute z-10 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#fd8863] to-[#9b3e20] shadow-sm dark:from-orange-400 dark:to-orange-700"
            style={{ left: `${markerCenterPct}%`, top: '-6px' }}
            aria-hidden
          />
          <div
            className="relative h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
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

        <p className="text-ink mt-3 text-center text-sm font-semibold tracking-tight uppercase dark:text-stone-100">
          {headline}
        </p>
        <p className="text-ink-muted mt-1 text-center text-[11px] font-medium dark:text-stone-400">{sub}</p>
      </div>
    </div>
  )
}
