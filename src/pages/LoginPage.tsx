import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'

export function LoginPage() {
  const { user, loading, configured, signIn, signUp } = useAuth()
  const location = useLocation()
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
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center justify-center px-6 dark:bg-paper-dark dark:text-stone-100">
      <div className="w-full max-w-sm">
        <p className="text-accent dark:text-orange-300 text-center text-xs font-semibold tracking-widest uppercase">
          Yuli’s Exclusive Outsmart HR
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
              className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
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
              className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
            />
          </label>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="bg-accent hover:bg-accent/90 text-stone-50 rounded-full py-3 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <p className="text-ink-muted mt-6 text-center text-sm dark:text-stone-400">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                type="button"
                className="text-accent font-medium hover:underline dark:text-orange-300"
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
                className="text-accent font-medium hover:underline dark:text-orange-300"
                onClick={() => setMode('signin')}
              >
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="text-ink-muted mt-4 text-center text-xs dark:text-stone-500">
          <Link to="/setup" className="hover:underline">
            Supabase setup
          </Link>
        </p>
      </div>
    </div>
  )
}
