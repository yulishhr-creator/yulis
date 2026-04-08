import { Link } from 'react-router-dom'

export function SetupPage() {
  return (
    <div className="bg-paper text-ink mx-auto max-w-lg px-6 py-20 dark:bg-paper-dark dark:text-stone-100">
      <h1 className="font-display text-2xl font-semibold">Configure Supabase</h1>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed dark:text-stone-400">
        Create a <code className="rounded bg-accent-soft/80 px-1">.env</code> file in the project root with:
      </p>
      <pre className="border-line bg-white/70 mt-4 overflow-x-auto rounded-xl border p-4 text-xs dark:bg-stone-900/60">
        {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
      </pre>
      <p className="text-ink-muted mt-4 text-sm dark:text-stone-400">
        Run the SQL in <code className="rounded bg-accent-soft/80 px-1">supabase/migrations/001_initial.sql</code> in the Supabase SQL
        editor, then restart <code className="rounded bg-accent-soft/80 px-1">npm run dev</code>.
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
