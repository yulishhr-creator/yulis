import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'yulis_splash_seen'

type AppSplashProps = {
  children: React.ReactNode
}

function hasSeenSplash(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

/** One splash per browser session — brand moment on first load. */
export function AppSplash({ children }: AppSplashProps) {
  const reduceMotion = useReducedMotion()
  const [showSplash, setShowSplash] = useState(() => !hasSeenSplash())

  useEffect(() => {
    if (!showSplash || reduceMotion) {
      if (showSplash && reduceMotion) {
        setShowSplash(false)
      }
      return
    }
    const t = window.setTimeout(() => setShowSplash(false), 1000)
    return () => window.clearTimeout(t)
  }, [showSplash, reduceMotion])

  useEffect(() => {
    if (!showSplash) {
      try {
        sessionStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  }, [showSplash])

  return (
    <AnimatePresence mode="wait">
      {showSplash ? (
        <motion.div
          key="splash"
          className="bg-paper fixed inset-0 z-[200] flex flex-col items-center justify-center dark:bg-paper-dark"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="bg-accent/15 absolute -top-1/4 -left-1/4 h-[60vh] w-[60vh] rounded-full blur-3xl"
              animate={reduceMotion ? {} : { scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -right-1/4 -bottom-1/4 h-[50vh] w-[50vh] rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-400/10"
              animate={reduceMotion ? {} : { scale: [1.05, 1, 1.05], opacity: [0.25, 0.45, 0.25] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center gap-6"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.img
              src="/lvlup-brand.svg"
              alt=""
              className="h-24 w-24 object-contain drop-shadow-md dark:opacity-95"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05, duration: 0.5 }}
            />
            <div
              className="border-accent h-10 w-10 animate-spin rounded-full border-2 border-t-transparent dark:border-orange-400 dark:border-t-transparent"
              aria-hidden
            />
            <motion.p
              className="font-stitch-head text-center text-xl font-extrabold text-[#302e2b] dark:text-stone-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.5 }}
            >
              LvlUp your hiring workflow
            </motion.p>
            <p className="text-ink-muted max-w-xs text-center text-sm dark:text-stone-400">
              Yuli&apos;s HR — tasks, roles, and candidates in one calm workspace.
            </p>
          </motion.div>

          <motion.p
            className="text-ink-muted absolute bottom-10 text-xs tracking-widest uppercase dark:text-stone-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.5 }}
          >
            Loading
          </motion.p>
        </motion.div>
      ) : (
        <motion.div
          key="app"
          className="min-h-dvh"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
