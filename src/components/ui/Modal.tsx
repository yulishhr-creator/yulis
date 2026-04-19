import { motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useOffCanvasOptional } from '@/components/layout/OffCanvasContext'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Narrow width for quick edits */
  size?: 'sm' | 'md' | 'lg'
  /** Rendered between the title and the close control (e.g. actions) */
  headerAside?: React.ReactNode
}

export function Modal({ open, onClose, title, children, size = 'md', headerAside }: ModalProps) {
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  /** Inline `onClose` from parents changes every render; must not re-run focus trap when only this reference changes. */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const offCanvas = useOffCanvasOptional()

  useEffect(() => {
    if (!offCanvas || !open) return
    offCanvas.open()
    return () => offCanvas.close()
  }, [offCanvas, open])

  useEffect(() => {
    if (!open) return
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0e315a' },
      body: JSON.stringify({
        sessionId: '0e315a',
        hypothesisId: 'H3',
        location: 'Modal.tsx:focusEffect',
        message: 'Modal focus trap effect ran',
        data: { open, runId: 'post-fix-verify' },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => {
      const root = panelRef.current
      const first =
        root?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? null
      // #region agent log
      fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0e315a' },
        body: JSON.stringify({
          sessionId: '0e315a',
          hypothesisId: 'H3',
          location: 'Modal.tsx:focusTimeout',
          message: 'Modal moved focus to first focusable',
          data: {
            tag: first?.tagName ?? null,
            ariaLabel: first?.getAttribute('aria-label') ?? null,
            runId: 'post-fix-verify',
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      first?.focus()
    }, 0)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      prevFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="bg-ink/35 absolute inset-0 backdrop-blur-[3px] dark:bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`border-line bg-paper shadow-accent/10 relative z-10 w-full ${maxW} rounded-2xl border p-6 shadow-2xl dark:border-line-dark dark:bg-stone-900`}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="modal-title" className="min-w-0 flex-1 text-lg font-semibold">
            {title}
          </h2>
          {headerAside ? <div className="flex shrink-0 items-center gap-2">{headerAside}</div> : null}
          <button
            type="button"
            onClick={onClose}
            className="border-line text-ink-muted hover:bg-accent-soft/60 -mr-1 -mt-1 rounded-full border p-1.5 transition dark:border-line-dark dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </motion.div>
    </div>,
    document.body,
  )
}
