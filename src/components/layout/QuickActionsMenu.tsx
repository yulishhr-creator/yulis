import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { Modal } from '@/components/ui/Modal'
import { buildQuickFabActions } from '@/components/layout/quickFabActions'

/**
 * Context-aware shortcuts (create task, position, calendar, etc.) — desktop entry in the sidebar.
 */
export function QuickActionsMenu() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const location = useLocation()
  const [fabOpen, setFabOpen] = useState(false)
  const closeFab = useCallback(() => setFabOpen(false), [])

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
    <>
      <Modal open={fabOpen} onClose={closeFab} title="Quick actions" size="md">
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

      <motion.button
        type="button"
        onClick={() => setFabOpen(true)}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-all duration-200 hover:bg-white/70 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100"
        whileHover={reduceMotion ? undefined : { scale: 1.01 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#9b3e20] to-[#fd8863] text-white shadow-sm shadow-[#9b3e20]/20 dark:from-orange-600 dark:to-orange-400">
          <Plus className="h-[18px] w-[18px] stroke-[2.25]" aria-hidden />
        </span>
        <span>Quick actions</span>
      </motion.button>
    </>
  )
}
