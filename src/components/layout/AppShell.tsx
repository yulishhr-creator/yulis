import { Link, NavLink } from 'react-router-dom'
import {
  ListTodo,
  Building2,
  Briefcase,
  Settings,
  Sparkles,
  User,
  LogOut,
  Bell,
  CalendarDays,
  Clock,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useNotificationCount } from '@/hooks/useNotificationCount'
import { AppLogo } from '@/components/ui/AppLogo'
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useWorkTimer } from '@/work/WorkTimerContext'
import { useToast } from '@/hooks/useToast'

const nav = [
  { to: '/', label: 'Tasks', icon: ListTodo, end: true },
  { to: '/positions', label: 'Positions', icon: Briefcase, end: false },
  { to: '/time', label: 'Time', icon: Clock, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: false },
  { to: '/companies', label: 'Clients', icon: Building2, end: false },
  { to: '/notifications', label: 'Notifications', icon: Bell, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatTimer(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { data: notificationCount = 0 } = useNotificationCount()
  const timer = useWorkTimer()
  const { success, error: toastError } = useToast()

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'there'
  const metaName = (user?.user_metadata?.full_name as string | undefined) ?? ''
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="bg-paper text-ink relative min-h-dvh overflow-x-hidden dark:bg-paper-dark dark:text-stone-100">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-0 h-[min(55vh,480px)] w-[min(60vw,480px)] rounded-full bg-gradient-to-bl from-[#fd8863]/20 via-[#97daff]/12 to-transparent blur-3xl dark:from-orange-500/15 dark:via-cyan-500/10" />
        <div className="absolute bottom-0 left-0 h-[min(45vh,400px)] w-[min(50vw,400px)] rounded-full bg-gradient-to-tr from-[#b4fdb4]/15 via-transparent to-[#fd8863]/10 blur-3xl dark:from-emerald-500/10" />
      </div>

      <a
        href="#main"
        className="focus:ring-accent sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      {/* Desktop / tablet: sidebar */}
      <aside className="border-line bg-paper/95 fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r backdrop-blur-xl lg:flex dark:border-line-dark dark:bg-paper-dark/95">
        <div className="border-line flex items-center gap-2 border-b px-4 py-4 dark:border-line-dark">
          <Link to="/" className="min-w-0">
            <AppLogo size="sm" />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#fd8863]/25 to-[#97daff]/20 text-stitch-on-surface shadow-sm ring-1 ring-[#9b3e20]/20 dark:from-orange-500/20 dark:to-cyan-500/15 dark:text-stone-100 dark:ring-orange-400/25'
                    : 'text-ink-muted hover:bg-white/70 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                      isActive
                        ? 'bg-white/90 text-[#9b3e20] shadow-inner dark:bg-stone-800 dark:text-orange-300'
                        : 'bg-white/50 text-ink-muted group-hover:bg-[#fd8863]/15 group-hover:text-[#9b3e20] dark:bg-stone-900/50 dark:group-hover:text-orange-300'
                    }`}
                    whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -3 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </motion.span>
                  <span className="relative z-10 flex-1">{label}</span>
                  {to === '/notifications' && notificationCount > 0 ? (
                    <span className="bg-red-500 text-[10px] font-extrabold text-white relative z-10 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-line relative border-t p-3 dark:border-line-dark">
          <div className="text-ink-muted flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase dark:text-stone-500">
            <Sparkles className="text-[#9b3e20] h-3.5 w-3.5 dark:text-orange-400" aria-hidden />
            Quick
          </div>
          <p className="text-ink-muted mt-2 text-xs leading-relaxed dark:text-stone-500">
            The bell counts overdue tasks, upcoming calendar events (next 48h), and reminders — events and reminders are separate.
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-line bg-paper/80 sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-3 py-3 backdrop-blur-xl sm:px-4 dark:border-line-dark dark:bg-paper-dark/80">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="border-line hover:ring-[#fd8863]/40 flex h-11 w-11 items-center justify-center rounded-full border bg-white/90 shadow-sm transition hover:shadow-md dark:border-line-dark dark:bg-stone-900/90"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <UserAvatar email={user?.email} name={metaName} avatarUrl={avatarUrl} size="sm" />
              </button>
              {menuOpen ? (
                <motion.div
                  role="menu"
                  className="border-line bg-paper absolute top-full left-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                  initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                >
                  <Link
                    to="/settings/profile"
                    role="menuitem"
                    className="hover:bg-[#fd8863]/15 flex items-center gap-2 px-3 py-2.5 text-sm dark:hover:bg-stone-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    <User className="h-4 w-4 opacity-70" aria-hidden />
                    Profile
                  </Link>
                  <Link
                    to="/calendar"
                    role="menuitem"
                    className="hover:bg-[#fd8863]/15 flex items-center gap-2 px-3 py-2.5 text-sm dark:hover:bg-stone-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    <CalendarDays className="h-4 w-4 opacity-70" aria-hidden />
                    Calendar
                  </Link>
                  <Link
                    to="/settings"
                    role="menuitem"
                    className="hover:bg-[#fd8863]/15 flex items-center gap-2 px-3 py-2.5 text-sm dark:hover:bg-stone-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4 opacity-70" aria-hidden />
                    Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="hover:bg-[#fd8863]/15 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm dark:hover:bg-stone-800"
                    onClick={() => {
                      setMenuOpen(false)
                      void signOut()
                    }}
                  >
                    <LogOut className="h-4 w-4 opacity-70" aria-hidden />
                    Sign out
                  </button>
                </motion.div>
              ) : null}
            </div>
            <motion.div
              className="min-w-0 flex-1 flex flex-col gap-0.5"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <p className="from-[#9b3e20] to-[#006384] bg-gradient-to-r bg-clip-text font-stitch-head truncate text-sm font-extrabold text-transparent sm:text-base dark:from-orange-300 dark:to-cyan-300">
                {greeting()}, {displayName}
              </p>
              <p className="truncate text-[9px] font-medium tracking-wide text-stone-400/55 dark:text-stone-500/70 sm:text-[10px]">
                Keep pushing forward.
              </p>
            </motion.div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/calendar"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 shadow-sm transition hover:bg-[#97daff]/30 dark:bg-stone-800/90 dark:hover:bg-cyan-900/40"
              aria-label="Calendar"
            >
              <CalendarDays className="text-[#006384] h-5 w-5 dark:text-cyan-300" aria-hidden />
            </Link>
            {timer.open ? (
              <div className="border-line flex max-w-[min(100%,14rem)] items-center gap-2 rounded-2xl border bg-white/90 px-2 py-1.5 shadow-sm dark:border-line-dark dark:bg-stone-800/90">
                <Clock className="text-[#9b3e20] h-4 w-4 shrink-0 dark:text-orange-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-[#302e2b] dark:text-stone-200">{timer.open.positionTitle}</p>
                  <p className="font-mono text-xs font-bold tabular-nums text-[#006384] dark:text-cyan-300">{formatTimer(timer.elapsedSeconds)}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-2.5 py-1 text-[10px] font-bold text-white uppercase"
                  onClick={async () => {
                    const r = await timer.stop()
                    if (r.error) toastError(r.error)
                    else success('Time saved')
                  }}
                >
                  Stop
                </button>
              </div>
            ) : null}
            <Link
              to="/notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 shadow-sm transition hover:bg-[#97daff]/30 dark:bg-stone-800/90 dark:hover:bg-cyan-900/40"
              aria-label={`Notifications${notificationCount ? `, ${notificationCount} items` : ''}`}
            >
              <Bell className="text-[#006384] h-5 w-5 dark:text-cyan-300" aria-hidden />
              {notificationCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold text-white">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <main
          id="main"
          className="mx-auto max-w-6xl px-4 pt-6 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:px-8 md:pt-8 lg:pb-10"
        >
          <AnimatedOutlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  )
}
