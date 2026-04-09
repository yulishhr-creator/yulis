import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'

const STORAGE_KEY = 'yulis_pwa_install_dismissed_until'
/** Hide the proposal after dismiss; show again after this interval */
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    return Date.now() < parseInt(raw, 10)
  } catch {
    return false
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_MS))
  } catch {
    /* ignore */
  }
}

function isLikelyIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Chromium/Edge/Android Chrome: uses beforeinstallprompt.
 * iOS Safari: no API — show Add to Home Screen instructions after a short delay if still no prompt.
 */
export function PwaInstallPrompt() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [banner, setBanner] = useState<'hidden' | 'chromium' | 'ios'>('hidden')

  const close = useCallback(() => {
    rememberDismiss()
    setBanner('hidden')
    deferredRef.current = null
  }, [])

  const install = useCallback(async () => {
    const ev = deferredRef.current
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
    } catch {
      /* user cancelled or prompt failed */
    }
    deferredRef.current = null
    setBanner('hidden')
  }, [])

  useEffect(() => {
    if (isStandaloneDisplay() || isDismissed()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      if (!isDismissed()) setBanner('chromium')
    }

    const onInstalled = () => {
      deferredRef.current = null
      setBanner('hidden')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (isStandaloneDisplay() || isDismissed()) return
    if (!isLikelyIos()) return

    const t = window.setTimeout(() => {
      if (deferredRef.current) return
      if (isDismissed()) return
      if (isStandaloneDisplay()) return
      setBanner((b) => (b === 'hidden' ? 'ios' : b))
    }, 6000)

    return () => window.clearTimeout(t)
  }, [])

  if (banner === 'hidden') return null

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-desc"
      className="border-line bg-paper/98 fixed right-3 left-3 z-[55] max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur-md dark:border-line-dark dark:bg-paper-dark/98 lg:right-6 lg:bottom-6 lg:left-auto lg:w-full lg:max-w-sm bottom-[max(7rem,calc(6.75rem+env(safe-area-inset-bottom,0px)+0.5rem))]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 text-[#9b3e20] dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-300">
          <Download className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="pwa-install-title" className="font-stitch-head text-base font-extrabold text-[#302e2b] dark:text-stone-100">
            {banner === 'chromium' ? 'Install as app?' : 'Add Yulis to your Home Screen'}
          </h2>
          <p id="pwa-install-desc" className="text-stitch-muted mt-1 text-sm leading-relaxed dark:text-stone-400">
            {banner === 'chromium' ? (
              <>
                Install <strong className="text-ink dark:text-stone-200">Yulis</strong> for quick access, a home screen icon, and a full-screen
                experience — like a native app.
              </>
            ) : (
              <>
                On iPhone or iPad: tap the <strong className="text-ink dark:text-stone-200">Share</strong> button{' '}
                <span className="whitespace-nowrap">(□↑)</span>, then <strong className="text-ink dark:text-stone-200">Add to Home Screen</strong>.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {banner === 'chromium' ? (
              <button
                type="button"
                className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-md"
                onClick={() => void install()}
              >
                Install
              </button>
            ) : null}
            <button
              type="button"
              className="border-line rounded-full border px-4 py-2 text-sm font-semibold dark:border-stone-600"
              onClick={close}
            >
              {banner === 'chromium' ? 'Not now' : 'Got it'}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="text-stitch-muted hover:text-ink -m-1 shrink-0 rounded-lg p-1 dark:hover:text-stone-200"
          aria-label="Dismiss"
          onClick={close}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
