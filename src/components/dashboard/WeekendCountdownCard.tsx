import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

const STEP_BY_JS_DAY = [1, 2, 3, 4, 5, 6, 6] as const

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MESSAGES = [
  'WHY GOD WHY?!',
  'Can I be any more tired?',
  'Why are you doing this to us?!',
  'Open for Mingling..',
  'Hurray! Last Push.. Sushi?',
  "What are you doing here? it's Weekend!",
  '"UGLY BABY" Judges you!',
] as const

function weekendProgress() {
  const day = new Date().getDay()
  const step = STEP_BY_JS_DAY[day]!
  const total = 6
  const pct = (step / total) * 100
  return { day, step, total, pct, message: MESSAGES[day]! }
}

/** Light social “countdown to Friday” strip between tasks and candidates on the dashboard. */
export function WeekendCountdownCard() {
  const reduceMotion = useReducedMotion()
  const { day, step, total, pct, message } = weekendProgress()

  return (
    <motion.section
      aria-labelledby="weekend-countdown-label"
      className="border-stitch-on-surface/10 rounded-3xl border bg-white/70 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/55"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <p id="weekend-countdown-label" className="sr-only">
        Work-week progress toward Friday — {step} of {total}
      </p>

      <div className="relative">
        {/* Tick marks — one per weekday, today highlighted */}
        <div className="mb-1 flex justify-between" aria-hidden>
          {DAY_LABELS.map((_, i) => (
            <div key={i} className="flex min-w-0 flex-1 justify-center">
              <motion.div
                className={`h-2 w-0.5 rounded-full ${
                  i === day
                    ? 'bg-[#9b3e20] shadow-[0_0_8px_rgba(155,62,32,0.45)] dark:bg-orange-400 dark:shadow-orange-500/30'
                    : i < day
                      ? 'bg-stone-400 dark:bg-stone-500'
                      : 'bg-stone-300/90 dark:bg-stone-600'
                }`}
                initial={reduceMotion ? false : { scaleY: 0.3, opacity: 0.5 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 0.05 + i * 0.035, type: 'spring', stiffness: 380, damping: 22 }}
              />
            </div>
          ))}
        </div>

        <div
          className="border-stitch-on-surface/15 relative h-3.5 w-full overflow-hidden rounded-full border bg-stone-200/90 shadow-inner dark:border-stone-600 dark:bg-stone-800"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-label={`${step} of ${total} toward weekend`}
        >
          <motion.div
            className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#9b3e20] via-[#fd8863] to-[#97daff] shadow-[0_0_14px_rgba(253,136,99,0.4)] dark:from-orange-600 dark:via-orange-400 dark:to-cyan-400 dark:shadow-orange-500/25"
            initial={reduceMotion ? { width: `${pct}%` } : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 90, damping: 20, mass: 0.8, delay: 0.08 }
            }
          >
            {!reduceMotion ? (
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-[40%] bg-gradient-to-r from-transparent via-white/45 to-transparent"
                initial={{ x: '-60%' }}
                animate={{ x: ['-60%', '320%'] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: 'linear', delay: 0.4 }}
              />
            ) : null}
          </motion.div>
        </div>

        <div className="mt-2.5 flex justify-between gap-0.5">
          {DAY_LABELS.map((label, i) => {
            const isToday = i === day
            return (
              <motion.span
                key={label}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.12 + i * 0.04, duration: 0.35 }}
                className={`min-w-0 flex-1 text-center text-[10px] font-bold uppercase tracking-wide sm:text-[11px] ${
                  isToday
                    ? 'text-[#9b3e20] dark:text-orange-300'
                    : 'text-stone-500 dark:text-stone-500'
                }`}
              >
                <motion.span
                  className="inline-block"
                  animate={
                    reduceMotion || !isToday
                      ? {}
                      : { scale: [1, 1.06, 1], transition: { repeat: Infinity, duration: 2.8, ease: 'easeInOut' } }
                  }
                >
                  {label}
                </motion.span>
              </motion.span>
            )
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={day}
          role="status"
          className="font-stitch-head mt-3 min-h-[2.75rem] text-center text-base font-extrabold tracking-tight text-[#302e2b] dark:text-stone-100"
          initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: 'blur(6px)' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {message}
        </motion.p>
      </AnimatePresence>

      <motion.p
        className="text-stitch-muted mt-2 text-center text-xs tabular-nums dark:text-stone-500"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.35, duration: 0.35 }}
      >
        {step}/{total} toward Friday
      </motion.p>
    </motion.section>
  )
}
