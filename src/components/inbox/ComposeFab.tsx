import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useOffCanvasOptional } from '@/components/layout/OffCanvasContext'
import {
  ComposeMessageModal,
  emptyComposeDraft,
  type ComposeDraft,
} from '@/components/inbox/ComposeMessageModal'
import { getGmailStatus, sendGmail } from '@/lib/gmailApi'
import { useToast } from '@/hooks/useToast'

export function ComposeFab() {
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const offCanvas = useOffCanvasOptional()
  const openOverlays = offCanvas?.openCount ?? 0

  const [composerOpen, setComposerOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [draft, setDraft] = useState<ComposeDraft>(() => emptyComposeDraft())

  const gmailQ = useQuery({
    queryKey: ['gmail-status'],
    queryFn: getGmailStatus,
    staleTime: 60_000,
  })

  const sendMut = useMutation({
    mutationFn: sendGmail,
    onSuccess: () => {
      success('Message sent')
      setComposerOpen(false)
      setMinimized(false)
      setDraft(emptyComposeDraft())
    },
    onError: (e: Error) => {
      toastError(e.message || 'Send failed')
    },
  })

  const hideFabButton = openOverlays > 0 || composerOpen

  const handleFabClick = useCallback(async () => {
    try {
      const st = gmailQ.data ?? (await getGmailStatus())
      if (!st.connected) {
        toastError('Connect Gmail in Settings to send mail.')
        navigate('/settings/gmail')
        return
      }
      setComposerOpen(true)
      setMinimized(false)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not check Gmail connection.')
    }
  }, [gmailQ.data, navigate, toastError])

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
          onClick={() => void handleFabClick()}
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
