import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { ToastContext, type ToastItem, type ToastKind } from '@/components/ui/toast-state'
import { mapUserFacingError } from '@/lib/errors'

export type { ToastItem, ToastKind } from '@/components/ui/toast-state'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idSeq = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++idSeq.current
      setToasts((prev) => [...prev, { id, message, kind }])
      window.setTimeout(() => remove(id), 4200)
    },
    [remove],
  )

  const success = useCallback((message: string) => push(message, 'success'), [push])
  const error = useCallback(
    (message: string | unknown) => {
      push(mapUserFacingError(message), 'error')
    },
    [push],
  )

  const value = useMemo(() => ({ push, success, error }), [push, success, error])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[250] flex max-w-sm flex-col gap-2 p-0 sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              role="status"
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`pointer-events-auto border-line rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md dark:border-line-dark ${
                t.kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-50'
                  : t.kind === 'error'
                    ? 'border-red-500/30 bg-red-50/95 text-red-950 dark:bg-red-950/90 dark:text-red-50'
                    : 'bg-paper/95 text-ink border-accent/20 dark:bg-stone-900/95 dark:text-stone-100'
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
