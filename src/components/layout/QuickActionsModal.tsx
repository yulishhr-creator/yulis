import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Modal } from '@/components/ui/Modal'
import { buildQuickFabActions } from '@/components/layout/quickFabActions'

type QuickActionsModalProps = {
  open: boolean
  onClose: () => void
}

export function QuickActionsModal({ open, onClose }: QuickActionsModalProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const closeFab = useCallback(() => onClose(), [onClose])

  const positionDetailMatch = location.pathname.match(/^\/positions\/([^/]+)$/)
  const positionDetailId = positionDetailMatch?.[1]
  const positionIdLooksLikeUuid =
    Boolean(positionDetailId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionDetailId!)
  const onPositionDetail = positionIdLooksLikeUuid
  const positionDetailPath = onPositionDetail && positionDetailId ? `/positions/${positionDetailId}` : undefined

  const fabActions = useMemo(
    () =>
      buildQuickFabActions({
        pathname: location.pathname,
        search: location.search,
        navigate,
        closeModal: closeFab,
        onPositionDetail,
        positionDetailPath,
      }),
    [location.pathname, location.search, navigate, closeFab, onPositionDetail, positionDetailPath],
  )

  return (
    <Modal open={open} onClose={closeFab} title="Quick actions" size="md">
      <p className="text-ink-muted mb-3 text-xs dark:text-stone-400">
        Shortcuts for the current screen — create tasks, positions, calendar events, and more.
      </p>
      <div className="flex max-h-[min(60vh,24rem)] flex-col gap-2 overflow-y-auto pr-1">
        {fabActions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-left text-sm font-semibold transition hover:border-[#fd8863]/40 dark:border-stone-600 dark:bg-stone-800/80 dark:hover:border-orange-500/30"
              onClick={a.onSelect}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center ${a.iconBgClass}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block">{a.title}</span>
                {a.subtitle ? (
                  <span className="text-ink-muted mt-0.5 block text-xs font-normal dark:text-stone-400">{a.subtitle}</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
