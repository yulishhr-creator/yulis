import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { disconnectGmail, getGmailStatus, sendGmail, startGmailOAuth } from '@/lib/gmailApi'
import { useToast } from '@/hooks/useToast'

export function SettingsGmailPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { success, error: toastError } = useToast()

  const gmailQ = useQuery({
    queryKey: ['gmail-status'],
    queryFn: getGmailStatus,
    retry: false,
  })

  const oauthHandled = useRef(false)
  useEffect(() => {
    if (oauthHandled.current) return
    const ok = params.get('connected') === '1'
    const err = params.get('error')
    if (!ok && !err) return
    oauthHandled.current = true
    if (ok) {
      success('Gmail connected')
      void queryClient.invalidateQueries({ queryKey: ['gmail-status'] })
    }
    if (err) {
      if (err.startsWith('missing_env:')) {
        const key = err.slice('missing_env:'.length)
        toastError(`Vercel is missing "${key}". Add it under Project → Settings → Environment Variables, then redeploy.`)
      } else {
        toastError(`Google: ${err}`)
      }
    }
    const next = new URLSearchParams(params)
    next.delete('connected')
    next.delete('error')
    setParams(next, { replace: true })
  }, [params, queryClient, setParams, success, toastError])

  const connectOnce = useRef(false)
  useEffect(() => {
    if (params.get('connect') !== '1' || connectOnce.current) return
    connectOnce.current = true
    const next = new URLSearchParams(params)
    next.delete('connect')
    setParams(next, { replace: true })
    void (async () => {
      try {
        const url = await startGmailOAuth()
        window.location.href = url
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Could not start Google sign-in')
      }
    })()
  }, [params, setParams, toastError])

  const discMut = useMutation({
    mutationFn: disconnectGmail,
    onSuccess: async () => {
      success('Disconnected Gmail')
      await queryClient.invalidateQueries({ queryKey: ['gmail-status'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const testMut = useMutation({
    mutationFn: async () => {
      const st = await getGmailStatus()
      if (!st.connected || !st.email) throw new Error('Gmail not connected')
      await sendGmail({
        to: [st.email],
        subject: 'Yulis — Gmail connection test',
        bodyText: 'If you see this, sending through Gmail works.',
      })
    },
    onSuccess: () => success('Test email sent'),
    onError: (e: Error) => toastError(e.message || 'Could not send test'),
  })

  async function connect() {
    try {
      const url = await startGmailOAuth()
      window.location.href = url
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not start Google sign-in')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader title="Gmail" subtitle="Send mail from Yulis using your Gmail account." backTo="/settings" />

      <section className="border-stitch-on-surface/10 rounded-3xl border bg-white/85 p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900/60">
        <h2 className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">Connection</h2>
        <p className="text-ink-muted mt-2 text-sm dark:text-stone-400">
          Authorize with Google (OAuth). Only the Gmail send scope is requested. Tokens stay on the server.
        </p>
        <p className="text-ink-muted mt-2 text-xs dark:text-stone-500">
          One-click: open{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px] dark:bg-stone-800">/settings/gmail?connect=1</code>{' '}
          while signed in.
        </p>

        <div className="mt-6">
          {gmailQ.isError ? (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-200">
              {gmailQ.error instanceof Error ? gmailQ.error.message : 'Could not reach Gmail status API.'}
            </p>
          ) : null}
          {gmailQ.isPending ? (
            <p className="text-ink-muted text-sm dark:text-stone-400">Checking connection…</p>
          ) : gmailQ.data?.connected && gmailQ.data.email ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-[#302e2b] dark:text-stone-100">
                Connected as <span className="text-accent">{gmailQ.data.email}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:border-[#fd8863]/40 dark:border-stone-600 dark:bg-stone-800"
                >
                  {testMut.isPending ? 'Sending…' : 'Send test email'}
                </button>
                <button
                  type="button"
                  onClick={() => discMut.mutate()}
                  disabled={discMut.isPending}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  {discMut.isPending ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded-2xl bg-gradient-to-r from-[#1a73e8] to-[#1557b0] px-6 py-3 text-sm font-bold text-white shadow-md dark:from-[#8ab4f8] dark:to-[#669df6] dark:text-stone-900"
            >
              Connect Gmail
            </button>
          )}
        </div>

        <p className="text-ink-muted mt-6 text-xs dark:text-stone-500">
          While your OAuth app is in <strong>Testing</strong>, add your Google account under Test users in Google Cloud.
          Redirect URI must match production:{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px] dark:bg-stone-800">
            https://yulis.vercel.app/api/gmail/oauth/callback
          </code>
        </p>
      </section>
    </div>
  )
}
