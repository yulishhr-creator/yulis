import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { ScreenHeader } from '@/components/layout/ScreenHeader'

export function IntegrationsPage() {
  const connectDialogRef = useRef<HTMLDialogElement>(null)
  const reduceMotion = useReducedMotion()

  return (
    <div className="mx-auto max-w-xl">
      <ScreenHeader title="Integrations" subtitle="Connect external services — Gmail send via Edge Functions (planned)." backTo="/settings" />

      <p className="text-stitch-muted text-sm dark:text-stone-400">
        Gmail OAuth and server-side send will be wired via Supabase Edge Functions + Google Cloud OAuth client. For now,
        use <strong>Email company</strong> / template flows with <code className="rounded bg-[#fd8863]/20 px-1">mailto:</code>{' '}
        to compose in your Gmail.
      </p>
      <div className="border-stitch-on-surface/10 mt-6 flex items-center gap-4 rounded-2xl border bg-white/80 px-4 py-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/50">
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
          <p className="font-stitch-head font-bold text-[#302e2b] dark:text-stone-100">Gmail</p>
          <p className="text-stitch-muted text-sm dark:text-stone-400">Connect to send from the app (coming with Edge deployment).</p>
        </div>
        <motion.button
          type="button"
          onClick={() => connectDialogRef.current?.showModal()}
          className="rounded-full border border-[#97daff]/60 bg-gradient-to-r from-[#97daff]/30 to-white px-4 py-2 text-sm font-bold text-[#006384] shadow-sm dark:border-cyan-800 dark:from-cyan-900/40 dark:to-stone-800 dark:text-cyan-300"
          whileHover={reduceMotion ? undefined : { scale: 1.03 }}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        >
          Connect
        </motion.button>
      </div>

      <dialog
        ref={connectDialogRef}
        className="border-stitch-on-surface/15 fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-2xl backdrop:bg-black/45 dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">Gmail in the app</h2>
        <p className="text-stitch-muted mt-3 text-sm leading-relaxed dark:text-stone-400">
          OAuth and server-side send are not wired yet (planned: Supabase Edge Functions + Google Cloud OAuth). Until then,
          use <strong>Email company</strong> and email template actions that open{' '}
          <code className="rounded bg-[#fd8863]/20 px-1">mailto:</code> links—you compose and send in Gmail yourself.
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] py-2.5 text-sm font-bold text-white"
          onClick={() => connectDialogRef.current?.close()}
        >
          Got it
        </button>
      </dialog>
    </div>
  )
}
