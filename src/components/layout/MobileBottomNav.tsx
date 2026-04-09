import { NavLink, useNavigate } from 'react-router-dom'
import { ListTodo, Building2, Briefcase, Settings, Plus, CalendarPlus } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'

import { Modal } from '@/components/ui/Modal'

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
  const [fabOpen, setFabOpen] = useState(false)

  return (
    <>
      <Modal open={fabOpen} onClose={() => setFabOpen(false)} title="Quick add">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-left text-sm font-semibold dark:border-stone-600 dark:bg-stone-800/80"
            onClick={() => {
              setFabOpen(false)
              navigate('/positions?create=1')
            }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fd8863]/20 text-[#9b3e20] dark:text-orange-300">
              <Briefcase className="h-5 w-5" aria-hidden />
            </span>
            New role
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-left text-sm font-semibold dark:border-stone-600 dark:bg-stone-800/80"
            onClick={() => {
              setFabOpen(false)
              navigate('/calendar?new=1')
            }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#97daff]/25 text-[#006384] dark:text-cyan-300">
              <CalendarPlus className="h-5 w-5" aria-hidden />
            </span>
            Add calendar event
          </button>
        </div>
      </Modal>

      <nav
        className="border-line bg-paper/92 fixed right-0 bottom-0 left-0 z-50 flex items-end justify-between gap-3 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(155,62,32,0.08)] backdrop-blur-xl lg:hidden dark:border-line-dark dark:bg-paper-dark/95 dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
        aria-label="Main navigation"
      >
        <NavGroup items={leftItems} reduceMotion={reduceMotion} />

        <div className="relative flex w-14 min-w-14 shrink-0 flex-col items-center justify-end self-stretch pb-0.5">
          <motion.div
            className="absolute left-1/2 bottom-full z-10 -translate-x-1/2 -translate-y-4"
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          >
            <button
              type="button"
              onClick={() => setFabOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#9b3e20] to-[#fd8863] text-white shadow-md shadow-[#9b3e20]/30 ring-[3px] ring-paper dark:ring-paper-dark"
              aria-label="Open quick add menu"
            >
              <Plus className="h-5 w-5 stroke-[2.25]" aria-hidden />
            </button>
          </motion.div>
        </div>

        <NavGroup items={rightItems} reduceMotion={reduceMotion} />
      </nav>
    </>
  )
}
