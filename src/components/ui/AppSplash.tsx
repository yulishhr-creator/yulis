import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { SplashFuturisticLoader } from '@/components/ui/SplashFuturisticLoader'

const STORAGE_KEY = 'yulis_splash_seen'

const SPLASH_HEADLINES = ['Locating the best candidates ever...', 'Aligning Stars..'] as const

/** ~2.6s per headline (fade in, hold, hand off); total splash ~5.2s before app. */
const HEADLINE_MS = 2600
const SPLASH_TOTAL_MS = HEADLINE_MS * SPLASH_HEADLINES.length

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

/** One splash per browser session — orbital loader + cycling headlines on first load. */
export function AppSplash({ children }: AppSplashProps) {
  const reduceMotion = useReducedMotion()
  const [showSplash, setShowSplash] = useState(() => !hasSeenSplash())
  const [headlineIdx, setHeadlineIdx] = useState(0)

  useEffect(() => {
    if (!showSplash || reduceMotion) {
      if (showSplash && reduceMotion) {
        setShowSplash(false)
      }
      return
    }
    const t1 = window.setTimeout(() => setHeadlineIdx(1), HEADLINE_MS)
    const t2 = window.setTimeout(() => setShowSplash(false), SPLASH_TOTAL_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
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
            <div className="absolute top-1/2 left-1/2 h-[min(90vw,28rem)] w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(59,30,84,0.07)] blur-3xl dark:bg-[rgba(196,168,212,0.12)]" />
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center gap-8 px-6"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <SplashFuturisticLoader />

            <div className="flex min-h-[5rem] max-w-md items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={headlineIdx}
                  role="status"
                  aria-live="polite"
                  className="text-ink text-center text-xl font-semibold tracking-tight dark:text-stone-100"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.55, ease: 'easeInOut' }}
                >
                  {SPLASH_HEADLINES[headlineIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
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
