import { motion, useReducedMotion } from 'framer-motion'

const STEP_BY_JS_DAY = [1, 2, 3, 4, 5, 6, 6] as const

const MESSAGES = [
  'WHY GOD WHY?!',
  'Can I be any more tired?',
  'Why are you doing this to us?!',
  'Open for Mingling..',
  'Hurray! Last Push.. Sushi?',
  "What are you doing here? it's Weekend!",
  '*BABY-FACE* Judges you',
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
  const { step, total, pct, message } = weekendProgress()

  return (
    <motion.section
      aria-labelledby="weekend-countdown-label"
      className="border-stitch-on-surface/10 rounded-3xl border bg-white/70 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/55"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <p id="weekend-countdown-label" className="sr-only">
        Work-week progress toward Friday — {step} of {total}
      </p>
      <div
        className="border-stitch-on-surface/15 h-3 w-full overflow-hidden rounded-full border bg-stone-200/90 dark:border-stone-600 dark:bg-stone-800"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={`${step} of ${total} toward weekend`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#9b3e20] via-[#fd8863] to-[#97daff] shadow-[0_0_12px_rgba(253,136,99,0.35)] transition-[width] duration-700 ease-out dark:from-orange-600 dark:via-orange-400 dark:to-cyan-400 dark:shadow-orange-500/20"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-stitch-head mt-3 text-center text-base font-extrabold tracking-tight text-[#302e2b] dark:text-stone-100">{message}</p>
      <p className="text-stitch-muted mt-1 text-center text-xs tabular-nums dark:text-stone-500">
        {step}/{total} toward Friday
      </p>
    </motion.section>
  )
}
