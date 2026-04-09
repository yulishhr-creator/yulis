import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { ListTodo, Building2, Briefcase, Settings, Plus } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useMemo, useState } from 'react'

import { Modal } from '@/components/ui/Modal'
import { buildQuickFabActions } from '@/components/layout/quickFabActions'

const leftItems = [
  { to: '/', label: 'Tasks', icon: ListTodo, end: true },
  { to: '/positions', label: 'Positions', icon: Briefcase, end: false },
] as const

const rightItems = [
  { to: '/companies', label: 'Clients', icon: Building2, end: false },
  { to: '/settings', label: 'More', icon: Settings, end: false },
] as const

function NavGroup({
  items,
  reduceMotion,
}: {
  items: typeof leftItems | typeof rightItems
  reduceMotion: boolean | null
}) {
  return (
    <div className="flex min-w-0 flex-1 justify-around">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-w-0 flex-1 max-w-[5.5rem] flex-col items-center gap-1 px-1 py-2 text-[10px] font-bold tracking-wide uppercase ${
              isActive
                ? 'text-[#9b3e20] dark:text-orange-300'
                : 'text-stitch-muted dark:text-stone-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <motion.span
                className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${
                  isActive
                    ? 'bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 text-[#9b3e20] shadow-inner dark:from-orange-500/25 dark:to-cyan-500/20 dark:text-orange-200'
                    : 'bg-white/70 text-stone-500 dark:bg-stone-800/80 dark:text-stone-400'
                }`}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </motion.span>
              <span className="max-w-full truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

export function MobileBottomNav() {
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
      <Modal open={fabOpen} onClose={closeFab} title="Quick actions">
        <p className="text-ink-muted mb-3 text-xs dark:text-stone-400">What you can do from this screen — same as the old top +, unified here.</p>
        <div className="flex flex-col gap-2">
          {fabActions.map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                type="button"
                className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-left text-sm font-semibold dark:border-stone-600 dark:bg-stone-800/80"
                onClick={a.onSelect}
              >
                <span className={`flex h-10 w-10 items-center justify-center ${a.iconBgClass}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block">{a.title}</span>
                  {a.subtitle ? <span className="text-ink-muted mt-0.5 block text-xs font-normal dark:text-stone-400">{a.subtitle}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      </Modal>

      <nav
        className="border-line bg-paper/92 fixed right-0 bottom-0 left-0 z-50 flex items-stretch justify-between gap-1 border-t px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_32px_rgba(155,62,32,0.08)] backdrop-blur-xl lg:hidden dark:border-line-dark dark:bg-paper-dark/95 dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
        aria-label="Main navigation"
      >
        <NavGroup items={leftItems} reduceMotion={reduceMotion} />

        <div className="flex w-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center gap-1 px-1 py-2">
          <motion.button
            type="button"
            onClick={() => setFabOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9b3e20] to-[#fd8863] text-white shadow-md shadow-[#9b3e20]/25"
            aria-label="Quick actions for this screen"
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          >
            <Plus className="h-5 w-5 stroke-[2.25]" aria-hidden />
          </motion.button>
          <span className="text-[10px] font-bold tracking-wide uppercase opacity-0" aria-hidden>
            —
          </span>
        </div>

        <NavGroup items={rightItems} reduceMotion={reduceMotion} />
      </nav>
    </>
  )
}
