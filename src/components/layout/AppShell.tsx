import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ListTodo,
  Building2,
  Briefcase,
  Settings,
  User,
  LogOut,
  Bell,
  CalendarDays,
  Clock,
  ChevronLeft,
  PanelLeft,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useNotificationCount } from '@/hooks/useNotificationCount'
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { QuickActionsHeaderTrigger, QuickActionsSidebarTrigger } from '@/components/layout/QuickActionsMenu'
import { QuickActionsModal } from '@/components/layout/QuickActionsModal'
import { WeatherVibes } from '@/components/layout/WeatherVibes'
import { WeekProgressCard } from '@/components/layout/WeekProgressCard'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { useWorkTimer } from '@/work/WorkTimerContext'
import { useToast } from '@/hooks/useToast'

const nav = [
  { to: '/', label: 'Tasks', icon: ListTodo, end: true },
  { to: '/positions', label: 'Positions', icon: Briefcase, end: false },
  { to: '/time', label: 'Time', icon: Clock, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: false },
  { to: '/companies', label: 'Clients', icon: Building2, end: false },
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
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
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
    <div className="bg-paper text-ink relative min-h-dvh min-w-[960px] overflow-x-auto dark:bg-paper-dark dark:text-stone-100">
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

      <QuickActionsModal open={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} />

      {/* Primary navigation — desktop workspace */}
      <aside
        id="app-sidebar"
        className={`border-line bg-paper/95 fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r backdrop-blur-xl transition-transform duration-300 ease-out dark:border-line-dark dark:bg-paper-dark/95 ${
          sidebarOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="border-line flex items-center gap-2 border-b px-3 py-3 dark:border-line-dark">
          <Link to="/" className="min-w-0 flex-1" title="LvlUp Talent Solutions">
            <img
              src="/lvlup-logo.png"
              alt="LvlUp Talent Solutions"
              className="h-10 max-h-10 w-auto max-w-[min(100%,11rem)] object-contain object-left"
              width={176}
              height={40}
            />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="border-line text-ink-muted hover:bg-[#ec6f9d]/10 hover:text-[#5a2b7e] dark:hover:bg-pink-500/10 dark:hover:text-pink-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/80 transition dark:border-line-dark dark:bg-stone-900/80"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <WeatherVibes />

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={(e) => {
                if (to === '/calendar' && location.pathname === '/calendar') {
                  e.preventDefault()
                  navigate('/')
                }
              }}
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
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-line border-t px-3 pt-2 pb-1 dark:border-line-dark">
          <QuickActionsSidebarTrigger onOpen={() => setQuickActionsOpen(true)} />
        </div>

        <WeekProgressCard />
      </aside>

      <div className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'pl-64' : 'pl-0'}`}>
        <header className="border-line bg-paper/80 sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur-xl dark:border-line-dark dark:bg-paper-dark/80">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!sidebarOpen ? (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="border-line text-ink-muted hover:ring-[#ec6f9d]/30 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white/90 shadow-sm transition hover:shadow-md dark:border-line-dark dark:bg-stone-900/90 dark:hover:ring-pink-500/25"
                aria-label="Open sidebar"
                aria-controls="app-sidebar"
                aria-expanded={sidebarOpen}
              >
                <PanelLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
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
              <p className="from-[#9b3e20] to-[#006384] bg-gradient-to-r bg-clip-text font-stitch-head truncate text-base font-extrabold text-transparent dark:from-orange-300 dark:to-cyan-300">
                {greeting()}, {displayName}
              </p>
              <p className="truncate text-[11px] font-semibold tracking-wide text-[#5c5348] dark:text-stone-400">
                Keep pushing forward
              </p>
            </motion.div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <QuickActionsHeaderTrigger onOpen={() => setQuickActionsOpen(true)} />
            <Link
              to={location.pathname === '/calendar' ? '/' : '/calendar'}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 shadow-sm transition hover:bg-[#97daff]/30 dark:bg-stone-800/90 dark:hover:bg-cyan-900/40 ${
                location.pathname === '/calendar' ? 'ring-2 ring-[#006384]/45 dark:ring-cyan-400/50' : ''
              }`}
              aria-label={location.pathname === '/calendar' ? 'Close calendar' : 'Calendar'}
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
          className="mx-auto max-w-6xl px-8 pb-10 pt-8"
        >
          <AnimatedOutlet />
        </main>
      </div>

      <PwaInstallPrompt />
    </div>
  )
}
