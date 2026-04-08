import { Link } from 'react-router-dom'

function isDeployedSite(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h !== 'localhost' && h !== '127.0.0.1'
}

export function SetupPage() {
  const deployed = isDeployedSite()

  return (
    <div className="bg-paper text-ink mx-auto max-w-lg px-6 py-20 dark:bg-paper-dark dark:text-stone-100">
      <h1 className="font-display text-2xl font-semibold">Configure Supabase</h1>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed dark:text-stone-400">
        The app needs your Supabase project URL and anon key. They must be available when the site is{' '}
        <strong>built</strong> (Vite bakes them into the bundle).
      </p>

      {deployed ? (
        <>
          <h2 className="font-display mt-8 text-lg font-semibold">Vercel (this deployment)</h2>
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
          <pre className="border-line bg-white/70 mt-4 overflow-x-auto rounded-xl border p-4 text-xs dark:bg-stone-900/60">
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
      <Link
        to="/login"
        className="bg-accent text-stone-50 hover:bg-accent/90 mt-8 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold"
      >
        Back to login
      </Link>
    </div>
  )
}
