import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useOffCanvasOptional } from '@/components/layout/OffCanvasContext'
import {
  ComposeMessageModal,
  emptyComposeDraft,
  type ComposeDraft,
} from '@/components/inbox/ComposeMessageModal'
import { sendComposeEmail } from '@/lib/emailSendApi'
import { useToast } from '@/hooks/useToast'

export function ComposeFab() {
  const { success, error: toastError } = useToast()
  const offCanvas = useOffCanvasOptional()
  const openOverlays = offCanvas?.openCount ?? 0

  const [composerOpen, setComposerOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [draft, setDraft] = useState<ComposeDraft>(() => emptyComposeDraft())

  const sendMut = useMutation({
    mutationFn: sendComposeEmail,
    onSuccess: (result) => {
      const suffix =
        result.messageId != null && result.messageId !== ''
          ? ` Message ID: ${result.messageId}.`
          : result.eventId != null && result.eventId !== ''
            ? ` Event ID: ${result.eventId}.`
            : ''
      success(`Message sent${suffix}`)
      setComposerOpen(false)
      setMinimized(false)
      setDraft(emptyComposeDraft())
    },
    onError: (e: Error) => {
      toastError(e.message || 'Send failed')
    },
  })

  const hideFabButton = openOverlays > 0 || composerOpen

  const handleFabClick = useCallback(() => {
    setComposerOpen(true)
    setMinimized(false)
  }, [])

  const updateDraft = useCallback((partial: Partial<ComposeDraft>) => {
    setDraft((d) => ({ ...d, ...partial }))
  }, [])

  const handleClose = useCallback(() => {
    setComposerOpen(false)
    setMinimized(false)
    setDraft(emptyComposeDraft())
  }, [])

  return (
    <>
      {!hideFabButton ? (
        <motion.button
          type="button"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          className="border-line bg-paper shadow-accent/20 fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-full border bg-gradient-to-br from-[#1a73e8] to-[#1557b0] text-white shadow-xl ring-2 ring-white/25 dark:border-line-dark dark:from-[#8ab4f8] dark:to-[#669df6] dark:text-stone-900 dark:ring-stone-800/40"
          aria-label="New message"
          onClick={handleFabClick}
        >
          <Mail className="h-7 w-7" strokeWidth={2} aria-hidden />
        </motion.button>
      ) : null}

      <ComposeMessageModal
        open={composerOpen}
        minimized={minimized}
        busy={sendMut.isPending}
        draft={draft}
        onDraftChange={updateDraft}
        onClose={handleClose}
        onMinimize={() => setMinimized(true)}
        onExpand={() => setMinimized(false)}
        onSend={async (payload) => {
          await sendMut.mutateAsync(payload)
        }}
      />
    </>
  )
}
