import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

type ScreenHeaderProps = {
  /** Omit or pass empty string to hide the main heading (subtitle-only layouts). */
  title?: string
  subtitle?: string
  /** When set, navigates here; otherwise `navigate(-1)` */
  backTo?: string
  right?: React.ReactNode
}

export function ScreenHeader({ title, subtitle, backTo, right }: ScreenHeaderProps) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  function goBack() {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <motion.div
      className="mb-6 flex flex-wrap items-start gap-3"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        type="button"
        onClick={goBack}
        className="border-line bg-white/90 text-ink hover:border-accent hover:bg-accent-soft/50 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition dark:border-line-dark dark:bg-stone-900/90 dark:text-stone-100 dark:hover:border-orange-400/40"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="text-stitch-on-surface text-2xl font-extrabold tracking-tight md:text-3xl dark:text-stone-100">
            {title}
          </h1>
        ) : null}
        {subtitle ? (
          <p className={`text-stitch-muted text-sm dark:text-stone-400 ${title ? 'mt-1' : 'text-base leading-relaxed md:text-lg'}`}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </motion.div>
  )
}
