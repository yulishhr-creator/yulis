import { useRef } from 'react'
import { Link } from 'react-router-dom'

export function IntegrationsPage() {
  const connectDialogRef = useRef<HTMLDialogElement>(null)

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link to="/settings" className="text-accent hover:underline dark:text-orange-300">
          Settings
        </Link>
      </p>
      <h1 className="font-display mt-2 text-2xl font-semibold">Integrations</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Gmail OAuth and server-side send will be wired via Supabase Edge Functions + Google Cloud OAuth client. For now,
        use <strong>Email company</strong> / template flows with <code className="rounded bg-accent-soft/80 px-1">mailto:</code>{' '}
        to compose in your Gmail.
      </p>
      <div className="border-line bg-white/70 mt-6 flex items-center gap-4 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45">
        <svg className="h-10 w-10" viewBox="0 0 48 48" aria-hidden>
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.6 8.84 4.1L42 6.5C37.5 1.5 31.2 0 24 0 14.6 0 6.3 5.6 2.5 13.8l7.2 5.6C11.6 12 17.3 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.4 5.5-2.4 5.5l7.2 5.6c4.2-3.9 7-9.7 7-15.6z"
          />
          <path
            fill="#FBBC05"
            d="M9.7 28.6c-.5-1.5-.8-3.1-.8-4.6s.3-3.1.8-4.6L2.5 13.8C.9 17.1 0 20.5 0 24s.9 6.9 2.5 10.2l7.2-5.6z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 12-2.1 16-5.7l-7.2-5.6c-2 1.4-4.6 2.2-8.8 2.2-6.7 0-12.4-4.5-14.4-10.6l-7.2 5.6C6.3 42.4 14.6 48 24 48z"
          />
        </svg>
        <div className="flex-1">
          <p className="font-medium">Gmail</p>
          <p className="text-ink-muted text-sm">
            Send from the app after OAuth ships. Use <strong>Connect</strong> for what works today.
          </p>
        </div>
        <button
          type="button"
          onClick={() => connectDialogRef.current?.showModal()}
          className="border-line bg-white/90 hover:bg-accent-soft/60 dark:hover:bg-stone-800/80 rounded-full border px-4 py-2 text-sm font-medium transition dark:border-line-dark dark:bg-stone-900/60"
        >
          Connect
        </button>
      </div>

      <dialog
        ref={connectDialogRef}
        className="border-line bg-paper backdrop:bg-ink/40 fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-xl dark:border-line-dark dark:bg-stone-900 dark:backdrop:bg-black/50"
      >
        <h2 className="font-display text-lg font-semibold">Gmail in the app</h2>
        <p className="text-ink-muted mt-3 text-sm leading-relaxed dark:text-stone-400">
          OAuth and server-side send are not wired yet (planned: Supabase Edge Functions + Google Cloud OAuth). Until then,
          use <strong>Email company</strong> and email template actions that open{' '}
          <code className="rounded bg-accent-soft/80 px-1">mailto:</code> links—you compose and send in Gmail yourself.
        </p>
        <button
          type="button"
          className="bg-accent text-stone-50 hover:bg-accent/90 mt-6 w-full rounded-full py-2.5 text-sm font-semibold"
          onClick={() => connectDialogRef.current?.close()}
        >
          Got it
        </button>
      </dialog>
    </div>
  )
}
