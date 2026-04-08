import { motion } from 'framer-motion'

import { AppLogo } from '@/components/ui/AppLogo'

type BrandLoaderProps = {
  label?: string
}

export function BrandLoader({ label = 'Loading…' }: BrandLoaderProps) {
  return (
    <div
      className="bg-paper text-ink-muted flex min-h-dvh flex-col items-center justify-center gap-8 dark:bg-paper-dark"
      role="status"
      aria-live="polite"
    >
      <motion.div
        className="relative"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        <motion.div
          className="border-accent/30 absolute inset-[-10px] rounded-full border-2 border-t-accent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        />
        <AppLogo size="lg" />
      </motion.div>
      <motion.p
        className="font-display text-ink text-lg dark:text-stone-200"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {label}
      </motion.p>
    </div>
  )
}
