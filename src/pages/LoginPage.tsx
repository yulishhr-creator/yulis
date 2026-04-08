import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Briefcase, Mail, Sparkles, Users } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { AppLogo } from '@/components/ui/AppLogo'

const floats = [
  { Icon: Briefcase, className: 'left-[8%] top-[18%]', rotate: -8 },
  { Icon: Users, className: 'right-[10%] top-[22%]', rotate: 6 },
  { Icon: Mail, className: 'left-[14%] bottom-[24%]', rotate: 4 },
  { Icon: Sparkles, className: 'right-[12%] bottom-[20%]', rotate: -5 },
] as const

export function LoginPage() {
  const { user, loading, configured, signIn, signUp } = useAuth()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!configured) {
    return <Navigate to="/setup" replace />
  }

  if (!loading && user) {
    return <Navigate to={from} replace />
  }

  if (loading) {
    return (
      <div className="bg-paper flex min-h-dvh items-center justify-center dark:bg-paper-dark">
        <motion.div
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="border-accent/30 h-10 w-10 rounded-full border-2 border-t-accent"
        />
      </div>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const fn = mode === 'signin' ? signIn : signUp
    const { error: err } = await fn(email.trim(), password)
    setPending(false)
    if (err) setError(err.message)
  }

  return (
    <div className="relative flex min-h-dvh overflow-hidden">
      <div className="from-paper via-accent-soft/30 to-amber-100/40 relative hidden flex-1 flex-col justify-between bg-gradient-to-br p-10 lg:flex dark:from-paper-dark dark:via-stone-900 dark:to-stone-950">
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            className="bg-accent/20 absolute top-1/4 left-1/4 h-72 w-72 rounded-full blur-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          <motion.div
            className="absolute right-1/4 bottom-1/3 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl dark:bg-orange-500/10"
            animate={reduceMotion ? undefined : { scale: [1.05, 1, 1.05] }}
            transition={{ duration: 7, repeat: Infinity }}
          />
        </div>
        {floats.map(({ Icon, className, rotate }, idx) => (
          <motion.div
            key={className}
            className={`text-accent/35 dark:text-orange-400/25 absolute ${className}`}
            initial={false}
            animate={
              reduceMotion
                ? undefined
                : {
                    y: [0, -10, 0],
                    rotate: [rotate, rotate + 4, rotate],
                  }
            }
            transition={{ duration: 5 + idx * 0.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon className="h-10 w-10 drop-shadow-sm" strokeWidth={1.25} aria-hidden />
          </motion.div>
        ))}
        <div className="relative z-10">
          <AppLogo size="lg" />
          <motion.p
            className="font-display text-ink mt-8 max-w-md text-3xl leading-tight font-semibold tracking-tight md:text-4xl dark:text-stone-100"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            Recruiting that feels human — not like a spreadsheet.
          </motion.p>
          <p className="text-ink-muted mt-4 max-w-sm text-sm leading-relaxed dark:text-stone-400">
            Positions, candidates, tasks, and reminders in one calm workspace.
          </p>
        </div>
        <p className="text-ink-muted relative z-10 text-xs tracking-widest uppercase dark:text-stone-500">Yuli’s Exclusive Outsmart HR</p>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 dark:bg-paper-dark">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent dark:from-orange-500/5" />
        <motion.div
          className="border-line bg-white/85 relative z-10 w-full max-w-md rounded-3xl border p-8 shadow-[0_25px_80px_-20px_rgba(196,92,38,0.25)] backdrop-blur-md dark:border-line-dark dark:bg-stone-900/85 dark:shadow-[0_25px_80px_-20px_rgba(0,0,0,0.5)]"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg:hidden mb-6 flex justify-center">
            <AppLogo size="md" />
          </div>
          <p className="text-accent text-center text-xs font-semibold tracking-[0.25em] uppercase dark:text-orange-300">
            {mode === 'signin' ? 'Welcome back' : 'Join the workspace'}
          </p>
          <h1 className="font-display mt-2 text-center text-2xl font-semibold tracking-tight">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-line bg-white/90 focus:border-accent focus:ring-accent/30 rounded-xl border px-3 py-2.5 outline-none transition focus:ring-2 dark:border-line-dark dark:bg-stone-950/50"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Password
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-line bg-white/90 focus:border-accent focus:ring-accent/30 rounded-xl border px-3 py-2.5 outline-none transition focus:ring-2 dark:border-line-dark dark:bg-stone-950/50"
              />
            </label>
            {error ? (
              <motion.p
                className="text-sm text-red-600 dark:text-red-400"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                role="alert"
              >
                {error}
              </motion.p>
            ) : null}
            <motion.button
              type="submit"
              disabled={pending}
              className="bg-accent text-stone-50 hover:bg-accent/92 shadow-accent/25 relative overflow-hidden rounded-full py-3 text-sm font-semibold shadow-lg disabled:opacity-60"
              whileHover={reduceMotion ? undefined : { scale: 1.01 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            >
              {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </motion.button>
          </form>

          <p className="text-ink-muted mt-6 text-center text-sm dark:text-stone-400">
            {mode === 'signin' ? (
              <>
                No account?{' '}
                <button
                  type="button"
                  className="text-accent font-semibold hover:underline dark:text-orange-300"
                  onClick={() => setMode('signup')}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-accent font-semibold hover:underline dark:text-orange-300"
                  onClick={() => setMode('signin')}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
          <p className="text-ink-muted mt-4 text-center text-xs dark:text-stone-500">
            <Link to="/setup" className="hover:text-accent transition dark:hover:text-orange-300">
              Supabase setup
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
