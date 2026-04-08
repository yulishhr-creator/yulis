import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Briefcase, Bell, Settings } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

const items = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/companies', label: 'Clients', icon: Building2, end: false },
  { to: '/positions', label: 'Roles', icon: Briefcase, end: false },
  { to: '/notifications', label: 'Alerts', icon: Bell, end: false },
  { to: '/settings', label: 'More', icon: Settings, end: false },
] as const

type MobileBottomNavProps = {
  badgeCount?: number
}

export function MobileBottomNav({ badgeCount = 0 }: MobileBottomNavProps) {
  const reduceMotion = useReducedMotion()

  return (
    <nav
      className="border-line bg-paper/92 fixed right-0 bottom-0 left-0 z-50 flex justify-around border-t pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_32px_rgba(155,62,32,0.08)] backdrop-blur-xl lg:hidden dark:border-line-dark dark:bg-paper-dark/95 dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
      aria-label="Main navigation"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-bold tracking-wide uppercase ${
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
              <span className="max-w-[4.5rem] truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
