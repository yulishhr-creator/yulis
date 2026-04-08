import { motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Narrow width for quick edits */
  size?: 'sm' | 'md'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const reduceMotion = useReducedMotion()
  if (!open) return null

  const maxW = size === 'sm' ? 'max-w-sm' : 'max-w-md'

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="bg-ink/35 absolute inset-0 backdrop-blur-[3px] dark:bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <motion.div
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
          <h2 id="modal-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
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
