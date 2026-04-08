import { motion, useReducedMotion } from 'framer-motion'

type PageHeaderProps = {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="font-display text-ink text-2xl font-semibold tracking-tight dark:text-stone-100">{title}</h1>
        {subtitle ? <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">{subtitle}</p> : null}
      </motion.div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
