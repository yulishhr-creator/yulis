import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

import { AppLogo } from '@/components/ui/AppLogo'

function isDeployedSite(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h !== 'localhost' && h !== '127.0.0.1'
}

export function SetupPage() {
  const deployed = isDeployedSite()
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-accent/12 absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl dark:bg-orange-500/15" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      </div>
      <motion.div
        className="text-ink relative mx-auto max-w-lg px-6 py-16 dark:text-stone-100"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="mb-8 flex justify-center">
          <AppLogo size="md" />
        </div>
        <h1 className="text-center text-2xl font-semibold">Configure Supabase</h1>
        <p className="text-ink-muted mt-3 text-center text-sm leading-relaxed dark:text-stone-400">
          The app needs your Supabase project URL and anon key. They must be available when the site is{' '}
          <strong>built</strong> (Vite bakes them into the bundle).
        </p>

        {deployed ? (
          <>
            <h2 className="mt-8 text-lg font-semibold">Vercel (this deployment)</h2>
            <ol className="text-ink-muted mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed dark:text-stone-400">
              <li>
                Open{' '}
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent font-medium underline dark:text-orange-300"
                >
                  Vercel Dashboard
                </a>{' '}
                → your project → <strong>Settings</strong> → <strong>Environment Variables</strong>.
              </li>
              <li>
                Add <code className="rounded bg-accent-soft/80 px-1">VITE_SUPABASE_URL</code> (from Supabase → Project Settings →
                API → Project URL).
              </li>
              <li>
                Add <code className="rounded bg-accent-soft/80 px-1">VITE_SUPABASE_ANON_KEY</code> (anon / public key — same
                page).
              </li>
              <li>
                Apply to <strong>Production</strong> (and Preview if you use preview URLs).
              </li>
              <li>
                <strong>Redeploy</strong>: Deployments → three dots on the latest deployment → Redeploy (or push a new commit).
                A new build is required so the variables are embedded.
              </li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-ink-muted mt-6 text-sm leading-relaxed dark:text-stone-400">
              Local: create a <code className="rounded bg-accent-soft/80 px-1">.env</code> in the project root:
            </p>
            <pre className="border-line bg-white/75 mt-4 overflow-x-auto rounded-xl border p-4 text-xs shadow-sm dark:border-line-dark dark:bg-stone-900/60">
              {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
            </pre>
            <p className="text-ink-muted mt-4 text-sm dark:text-stone-400">
              Then restart <code className="rounded bg-accent-soft/80 px-1">npm run dev</code>.
            </p>
          </>
        )}

        <p className="text-ink-muted mt-6 text-sm dark:text-stone-400">
          Database schema: run <code className="rounded bg-accent-soft/80 px-1">supabase/migrations/001_initial.sql</code> once
          (if you have not already), or apply via Supabase MCP / CLI.
        </p>
        <div className="mt-10 flex justify-center">
          <motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Link
              to="/login"
              className="bg-accent text-stone-50 hover:bg-accent/90 shadow-accent/25 inline-flex rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg"
            >
              Back to login
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
