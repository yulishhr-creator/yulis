import { motion, useReducedMotion } from 'framer-motion'

type Props = {
  className?: string
}

/**
 * Session splash loader — orbital gradient rings + soft core (no GIF).
 * Respects reduced motion: static, non-spinning frame.
 */
export function SplashFuturisticLoader({ className = '' }: Props) {
  const reduceMotion = useReducedMotion()

  const spin = reduceMotion
    ? {}
    : {
        rotate: 360,
        transition: { repeat: Infinity, duration: 5.5, ease: 'linear' as const },
      }

  const spinReverse = reduceMotion
    ? {}
    : {
        rotate: -360,
        transition: { repeat: Infinity, duration: 3.8, ease: 'linear' as const },
      }

  return (
    <div
      className={`relative flex h-[5.75rem] w-[5.75rem] items-center justify-center ${className}`}
      aria-hidden
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-[-20%] rounded-full bg-gradient-to-tr from-[#9b3e20]/25 via-[#fd8863]/20 to-[#97daff]/30 blur-2xl dark:from-orange-500/20 dark:via-orange-400/15 dark:to-cyan-400/25" />

      {/* Outer conic ring */}
      <motion.div
        className="absolute inset-[6%] rounded-full p-[3px]"
        style={{
          transformOrigin: 'center',
          background: 'conic-gradient(from 120deg, #9b3e20, #fd8863, #97daff, #006384, #9b3e20)',
        }}
        animate={spin}
      >
        <div className="h-full w-full rounded-full bg-paper dark:bg-paper-dark" />
      </motion.div>

      {/* Inner dashed orbit */}
      <motion.svg
        className="absolute h-[72%] w-[72%]"
        viewBox="0 0 100 100"
        style={{ transformOrigin: '50% 50%' }}
        animate={spinReverse}
      >
        <defs>
          <linearGradient id="splash-orbit-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9b3e20" />
            <stop offset="45%" stopColor="#fd8863" />
            <stop offset="100%" stopColor="#97daff" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="url(#splash-orbit-grad)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="28 88"
          opacity={0.95}
        />
      </motion.svg>

      {/* Core pulse */}
      <motion.div
        className="relative z-[1] h-7 w-7 rounded-full bg-gradient-to-br from-[#fd8863] via-[#9b3e20] to-[#006384] shadow-[0_0_24px_rgba(253,136,99,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[0_0_28px_rgba(251,146,60,0.45)]"
        animate={
          reduceMotion
            ? {}
            : {
                scale: [1, 1.12, 1],
                opacity: [0.88, 1, 0.88],
                transition: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' },
              }
        }
      />
    </div>
  )
}
