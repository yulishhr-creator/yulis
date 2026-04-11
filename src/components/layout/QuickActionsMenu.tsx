import { Plus, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

type QuickActionsSidebarTriggerProps = {
  onOpen: () => void
}

/** Sidebar row that opens the shared quick-actions modal (same as mobile + FAB). */
export function QuickActionsSidebarTrigger({ onOpen }: QuickActionsSidebarTriggerProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-all duration-200 hover:bg-white/70 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100"
      whileHover={reduceMotion ? undefined : { scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#9b3e20] to-[#fd8863] text-white shadow-sm shadow-[#9b3e20]/20 dark:from-orange-600 dark:to-orange-400">
        <Plus className="h-[18px] w-[18px] stroke-[2.25]" aria-hidden />
      </span>
      <span>Quick actions</span>
    </motion.button>
  )
}

type QuickActionsHeaderTriggerProps = {
  onOpen: () => void
}

/** Header chip: opens the same quick-actions modal as the sidebar + button. */
export function QuickActionsHeaderTrigger({ onOpen }: QuickActionsHeaderTriggerProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="border-line hover:ring-[#ec6f9d]/35 flex items-center gap-2 rounded-2xl border bg-white/90 px-3 py-2 text-left text-sm font-semibold shadow-sm transition hover:shadow-md dark:border-line-dark dark:bg-stone-900/90 dark:hover:ring-pink-500/25"
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      aria-label="Open quick actions"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#5a2b7e]/90 to-[#ec6f9d]/80 text-white shadow-sm dark:from-violet-700 dark:to-pink-500">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <span className="hidden text-[#302e2b] sm:inline dark:text-stone-200">Actions (Quick)</span>
    </motion.button>
  )
}
