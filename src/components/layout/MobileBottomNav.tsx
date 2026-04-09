import { Link, NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Briefcase, Bell, Settings, Plus } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

const leftItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/companies', label: 'Clients', icon: Building2, end: false },
] as const

const rightItems = [
  { to: '/positions', label: 'Roles', icon: Briefcase, end: false },
  { to: '/notifications', label: 'Alerts', icon: Bell, end: false },
  { to: '/settings', label: 'More', icon: Settings, end: false },
] as const

type MobileBottomNavProps = {
  badgeCount?: number
}

function NavGroup({
  items,
  badgeCount,
  reduceMotion,
}: {
  items: typeof leftItems | typeof rightItems
  badgeCount: number
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
            `relative flex min-w-0 flex-1 max-w-[5.5rem] flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] font-bold tracking-wide uppercase ${
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
                {to === '/notifications' && badgeCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold text-white">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                ) : null}
              </motion.span>
              <span className="max-w-full truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

export function MobileBottomNav({ badgeCount = 0 }: MobileBottomNavProps) {
  const reduceMotion = useReducedMotion()

  return (
    <nav
      className="border-line bg-paper/92 fixed right-0 bottom-0 left-0 z-50 flex items-end justify-between gap-1 border-t px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_32px_rgba(155,62,32,0.08)] backdrop-blur-xl lg:hidden dark:border-line-dark dark:bg-paper-dark/95 dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
      aria-label="Main navigation"
    >
      <NavGroup items={leftItems} badgeCount={badgeCount} reduceMotion={reduceMotion} />

      <div className="relative flex w-[4.25rem] shrink-0 flex-col items-center pb-1">
        <motion.div
          className="absolute bottom-[calc(100%-0.25rem)] left-1/2 z-10 -translate-x-1/2"
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        >
          <Link
            to="/positions?create=1"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#9b3e20] to-[#fd8863] text-white shadow-lg shadow-[#9b3e20]/35 ring-4 ring-paper dark:ring-paper-dark"
            aria-label="Create position"
          >
            <Plus className="h-7 w-7 stroke-[2.5]" aria-hidden />
          </Link>
        </motion.div>
      </div>

      <NavGroup items={rightItems} badgeCount={badgeCount} reduceMotion={reduceMotion} />
    </nav>
  )
}
