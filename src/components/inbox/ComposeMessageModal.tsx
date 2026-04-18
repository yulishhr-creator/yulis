import type { ReactNode } from 'react'
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Italic,
  Link2,
  Loader2,
  Lock,
  Minus,
  Paperclip,
  Palette,
  PenLine,
  Send,
  Smile,
  Trash2,
  Underline,
  ImageIcon,
  MoreVertical,
  Sparkles,
  SquarePen,
  Type,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'

function textToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

export type ComposeDraft = {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  showCc: boolean
  showBcc: boolean
}

export function emptyComposeDraft(): ComposeDraft {
  return {
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    showCc: false,
    showBcc: false,
  }
}

export type ComposeMessageModalProps = {
  open: boolean
  minimized: boolean
  busy: boolean
  draft: ComposeDraft
  onDraftChange: (partial: Partial<ComposeDraft>) => void
  onClose: () => void
  onMinimize: () => void
  onExpand: () => void
  onSend: (payload: {
    to: string[]
    cc: string[]
    bcc: string[]
    subject: string
    bodyText: string
    bodyHtml?: string
  }) => Promise<void>
}

export function ComposeMessageModal({
  open,
  minimized,
  busy,
  draft,
  onDraftChange,
  onClose,
  onMinimize,
  onExpand,
  onSend,
}: ComposeMessageModalProps) {
  if (!open) return null

  async function submit() {
    const toList = draft.to
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const ccList = draft.cc
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const bccList = draft.bcc
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const t = draft.body.trim()
    await onSend({
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject: draft.subject.trim(),
      bodyText: t,
      bodyHtml: t ? textToHtml(t) : undefined,
    })
  }

  const panel = minimized ? (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="border-line bg-paper shadow-accent/15 fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] cursor-pointer items-center justify-between rounded-t-xl border px-4 py-3 shadow-2xl dark:border-line-dark dark:bg-stone-900"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onExpand()
        }
      }}
    >
      <span className="truncate text-sm font-semibold text-[#1a3b5c] dark:text-sky-100">New Message</span>
      <ChevronUp className="text-ink-muted h-5 w-5 shrink-0 dark:text-stone-400" aria-hidden />
    </motion.div>
  ) : (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="border-line bg-paper shadow-accent/15 fixed bottom-4 right-4 z-[100] flex h-[min(640px,calc(100dvh-2rem))] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-xl border shadow-2xl dark:border-line-dark dark:bg-stone-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-stone-200/90 bg-[#f6f8fc] px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900/95">
        <h2 id="compose-title" className="truncate text-[15px] font-semibold text-[#1a3b5c] dark:text-sky-100">
          New Message
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-full p-2 text-stone-600 hover:bg-white/90 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label="Minimize"
            onClick={onMinimize}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="rounded-full p-2 text-stone-600 opacity-40 dark:text-stone-500"
            aria-label="Full screen"
            disabled
          >
            <SquarePen className="h-4 w-4 scale-75" aria-hidden />
          </button>
          <button
            type="button"
            className="rounded-full p-2 text-stone-600 hover:bg-white/90 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="border-b border-stone-200/80 px-3 py-2 dark:border-stone-700">
        <div className="flex items-start gap-2">
          <span className="text-ink-muted w-11 shrink-0 pt-2 text-xs font-semibold uppercase dark:text-stone-500">To</span>
          <input
            className="placeholder:text-ink-muted min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none dark:text-stone-100"
            value={draft.to}
            onChange={(e) => onDraftChange({ to: e.target.value })}
            aria-label="To recipients"
          />
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
            {!draft.showCc ? (
              <button
                type="button"
                className="text-accent text-xs font-semibold hover:underline"
                onClick={() => onDraftChange({ showCc: true })}
              >
                Cc
              </button>
            ) : null}
            {!draft.showBcc ? (
              <button
                type="button"
                className="text-accent text-xs font-semibold hover:underline"
                onClick={() => onDraftChange({ showBcc: true })}
              >
                Bcc
              </button>
            ) : null}
          </div>
        </div>
        {(draft.showCc || draft.cc) && (
          <div className="mt-1 flex items-start gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
            <span className="text-ink-muted w-11 shrink-0 pt-2 text-xs font-semibold uppercase dark:text-stone-500">Cc</span>
            <input
              className="placeholder:text-ink-muted min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none dark:text-stone-100"
              value={draft.cc}
              onChange={(e) => onDraftChange({ cc: e.target.value })}
              aria-label="Cc recipients"
            />
          </div>
        )}
        {(draft.showBcc || draft.bcc) && (
          <div className="mt-1 flex items-start gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
            <span className="text-ink-muted w-11 shrink-0 pt-2 text-xs font-semibold uppercase dark:text-stone-500">Bcc</span>
            <input
              className="placeholder:text-ink-muted min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none dark:text-stone-100"
              value={draft.bcc}
              onChange={(e) => onDraftChange({ bcc: e.target.value })}
              aria-label="Bcc recipients"
            />
          </div>
        )}
      </div>

      <div className="border-b border-stone-200/80 px-3 py-2 dark:border-stone-700">
        <input
          className="placeholder:text-ink-muted w-full border-0 bg-transparent py-2 text-sm outline-none dark:text-stone-100"
          placeholder="Subject"
          value={draft.subject}
          onChange={(e) => onDraftChange({ subject: e.target.value })}
          aria-label="Subject"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-stone-950">
        <textarea
          className="placeholder:text-ink-muted min-h-[180px] flex-1 resize-none border-0 bg-transparent px-4 py-3 text-sm outline-none dark:text-stone-100"
          value={draft.body}
          onChange={(e) => onDraftChange({ body: e.target.value })}
          aria-label="Message body"
        />

        <div className="border-t border-stone-200/90 bg-[#fafafa] px-2 py-1.5 dark:border-stone-700 dark:bg-stone-900/80">
          <div className="flex flex-wrap items-center gap-1 text-stone-600 dark:text-stone-400">
            <ToolbarIconBtn label="Undo" disabled>
              <ChevronDown className="h-4 w-4 rotate-90" />
            </ToolbarIconBtn>
            <ToolbarIconBtn label="Redo" disabled>
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </ToolbarIconBtn>
            <span className="mx-1 h-4 w-px bg-stone-300 dark:bg-stone-600" aria-hidden />
            <button type="button" className="rounded px-2 py-1 text-xs font-medium opacity-70" disabled>
              Sans Serif
            </button>
            <button type="button" className="rounded px-2 py-1 text-xs font-medium opacity-70" disabled>
              TT
            </button>
            <ToolbarIconBtn label="Bold" disabled>
              <Bold className="h-4 w-4" />
            </ToolbarIconBtn>
            <ToolbarIconBtn label="Italic" disabled>
              <Italic className="h-4 w-4" />
            </ToolbarIconBtn>
            <ToolbarIconBtn label="Underline" disabled>
              <Underline className="h-4 w-4" />
            </ToolbarIconBtn>
            <ToolbarIconBtn label="Text color" disabled>
              <Palette className="h-4 w-4" />
            </ToolbarIconBtn>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-200/90 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-950">
        <div className="relative flex items-stretch rounded-lg shadow-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex items-center gap-2 rounded-l-lg bg-[#1a73e8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1557b0] disabled:opacity-60 dark:bg-[#8ab4f8] dark:text-stone-900 dark:hover:bg-[#aecbfa]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Send
          </button>
          <button
            type="button"
            disabled
            className="rounded-r-lg border border-l-0 border-[#1a73e8] bg-[#1a73e8] px-2 py-2 text-white opacity-50 dark:border-[#8ab4f8] dark:bg-[#8ab4f8]"
            aria-label="Schedule send"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-1 text-[#5f6368] dark:text-stone-400">
          <FooterIcon label="Assist" disabled>
            <Sparkles className="h-[18px] w-[18px] text-[#1a73e8] dark:text-[#8ab4f8]" />
          </FooterIcon>
          <FooterIcon label="Formatting" disabled>
            <Type className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Attach files" disabled>
            <Paperclip className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Insert link" disabled>
            <Link2 className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Emoji" disabled>
            <Smile className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Drive" disabled>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M7.71 3.5 1.15 15l3.56 6h11.56l6.56-11.5L18.29 3.5H7.71ZM8.85 5h8.3l5.08 9H14.08L8.85 5Zm-5.77 10 2.94-5.13L14.92 19H5.77l-2.69-4.5Z"
              />
            </svg>
          </FooterIcon>
          <FooterIcon label="Photo" disabled>
            <ImageIcon className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Confidential" disabled>
            <Lock className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="Signature" disabled>
            <PenLine className="h-[18px] w-[18px]" />
          </FooterIcon>
          <FooterIcon label="More" disabled>
            <MoreVertical className="h-[18px] w-[18px]" />
          </FooterIcon>
          <button
            type="button"
            className="ml-auto rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Discard"
            onClick={onClose}
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
      </div>
    </motion.div>
  )

  return createPortal(panel, document.body)
}

function ToolbarIconBtn({
  label,
  children,
  disabled,
}: {
  label: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className="rounded p-1.5 hover:bg-stone-200/80 disabled:opacity-40 dark:hover:bg-stone-700"
    >
      {children}
    </button>
  )
}

function FooterIcon({
  label,
  children,
  disabled,
}: {
  label: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className="rounded-lg p-2 hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
    >
      {children}
    </button>
  )
}
