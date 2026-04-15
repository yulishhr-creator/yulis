import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Settings,
  User,
  LogOut,
  Bell,
  CalendarDays,
  Clock,
  ChevronLeft,
  PanelLeft,
  ListTodo,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useNotificationCount } from '@/hooks/useNotificationCount'
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { QuickActionsSidebarTrigger } from '@/components/layout/QuickActionsMenu'
import { QuickActionsModal } from '@/components/layout/QuickActionsModal'
import { WeatherVibes } from '@/components/layout/WeatherVibes'
import { WeekProgressCard } from '@/components/layout/WeekProgressCard'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { useWorkTimer } from '@/work/WorkTimerContext'
import { useToast } from '@/hooks/useToast'
import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'

const overviewNav = {
  to: '/',
  label: 'Overview',
  icon: LayoutDashboard,
  activeRow:
    'from-lume-coral/30 to-lume-sky/22 ring-orange-500/20 dark:from-orange-500/25 dark:to-cyan-500/18 dark:ring-orange-400/30',
  idleIcon:
    'from-lume-coral/18 to-lume-sky/12 text-[#8b3a18] dark:from-orange-500/20 dark:to-cyan-500/12 dark:text-orange-200/90',
  activeIcon:
    'from-white to-orange-50/95 text-[#7a3318] shadow-inner dark:from-stone-800 dark:to-orange-950/60 dark:text-orange-100',
} as const

const clientsNav = {
  to: '/companies',
  label: 'Clients',
  icon: Building2,
  activeRow:
    'from-lume-sky/28 to-blue-500/18 ring-sky-500/25 dark:from-sky-500/22 dark:to-blue-500/14 dark:ring-sky-400/35',
  idleIcon:
    'from-sky-500/16 to-blue-500/10 text-sky-900/85 dark:from-sky-500/18 dark:to-blue-500/12 dark:text-sky-200/90',
  activeIcon:
    'from-white to-sky-50/95 text-sky-900 shadow-inner dark:from-stone-800 dark:to-sky-950/50 dark:text-sky-100',
} as const

const settingsNav = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  activeRow:
    'from-lume-gold/25 to-amber-600/15 ring-amber-500/20 dark:from-amber-500/18 dark:to-stone-600/20 dark:ring-amber-400/28',
  idleIcon:
    'from-amber-500/14 to-stone-400/10 text-amber-900/80 dark:from-amber-500/16 dark:to-stone-500/12 dark:text-amber-200/85',
  activeIcon:
    'from-white to-amber-50/95 text-amber-950 shadow-inner dark:from-stone-800 dark:to-amber-950/40 dark:text-amber-100',
} as const

const myTasksGroup = {
  activeRow:
    'from-lume-jade/26 to-emerald-400/18 ring-teal-500/20 dark:from-teal-500/20 dark:to-emerald-500/14 dark:ring-teal-400/30',
  idleIcon:
    'from-teal-500/16 to-emerald-500/10 text-teal-900/85 dark:from-teal-500/18 dark:to-emerald-500/12 dark:text-teal-200/90',
  activeIcon:
    'from-white to-teal-50/95 text-teal-900 shadow-inner dark:from-stone-800 dark:to-teal-950/50 dark:text-teal-100',
} as const

const TASK_STATUS_SIDEBAR = [
  { param: 'todo' as const, label: 'To do', countKey: 'todo' as const },
  { param: 'in_progress' as const, label: 'In progress', countKey: 'inProgress' as const },
  { param: 'done' as const, label: 'Done', countKey: 'done' as const },
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
  const [searchParams] = useSearchParams()
  const taskStatusParam = searchParams.get('taskStatus')
  const overviewNavActive = location.pathname === '/' && !taskStatusParam
  const { data: taskKpis, isPending: taskKpisPending } = useDashboardTaskKpis()
  const OverviewNavIcon = overviewNav.icon
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

  const accountMenuEl = (
    <div ref={menuRef} className="relative shrink-0">
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
  )

  return (
    <div className="bg-paper text-ink relative min-h-dvh min-w-[960px] overflow-x-auto dark:bg-paper-dark dark:text-stone-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="animate-aurora-drift absolute top-[-10%] right-[-5%] h-[min(62vh,520px)] w-[min(68vw,560px)] rounded-full bg-gradient-to-bl from-lume-coral/32 via-lume-violet/18 to-lume-sky/14 blur-3xl dark:from-orange-500/22 dark:via-violet-500/14 dark:to-cyan-500/12"
          aria-hidden
        />
        <div
          className="animate-aurora-drift absolute bottom-[-8%] left-[-8%] h-[min(50vh,440px)] w-[min(55vw,420px)] rounded-full bg-gradient-to-tr from-lume-jade/22 via-lume-rose/12 to-lume-gold/18 blur-3xl [animation-delay:-9s] dark:from-teal-500/14 dark:via-rose-500/10 dark:to-amber-500/12"
          aria-hidden
        />
        <div
          className="absolute top-1/3 left-1/3 h-[min(40vh,320px)] w-[min(45vw,380px)] -translate-x-1/2 rounded-full bg-gradient-to-r from-fuchsia-400/10 via-transparent to-lume-sky/12 blur-3xl dark:from-fuchsia-500/8 dark:to-cyan-500/10"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-[0.45] dark:opacity-[0.35]"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 90% 55% at 50% -15%, rgba(249, 115, 77, 0.14), transparent 55%),
              radial-gradient(ellipse 70% 45% at 100% 40%, rgba(167, 139, 250, 0.1), transparent 50%),
              radial-gradient(ellipse 65% 50% at 0% 85%, rgba(45, 212, 191, 0.09), transparent 48%)
            `,
          }}
          aria-hidden
        />
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
        className={`border-line fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-gradient-to-b from-white/92 via-paper/96 to-lume-sky/5 backdrop-blur-xl transition-transform duration-300 ease-out dark:border-line-dark dark:from-stone-950/92 dark:via-paper-dark/96 dark:to-violet-950/20 ${
          sidebarOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
        }`}
        aria-hidden={!sidebarOpen}
      >
        {sidebarOpen ? (
          <div className="border-line border-b px-3 py-3 dark:border-line-dark">
            <div className="flex items-start gap-2.5">
              {accountMenuEl}
              <motion.div
                className="min-w-0 flex-1 flex flex-col gap-0.5 pt-0.5"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <p className="text-ink truncate text-sm font-semibold dark:text-stone-100">
                  {greeting()}, {displayName}
                </p>
                <p className="text-ink-muted truncate text-[10px] font-semibold tracking-wide dark:text-stone-400">
                  Keep pushing forward
                </p>
              </motion.div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="border-line text-ink-muted hover:bg-[#ec6f9d]/10 hover:text-[#5a2b7e] dark:hover:bg-pink-500/10 dark:hover:text-pink-200 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-white/80 transition dark:border-line-dark dark:bg-stone-900/80"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          <div className="rounded-xl pb-1">
            <div className="text-ink-muted flex items-center gap-3 px-3 py-2 text-xs font-bold tracking-wide uppercase dark:text-stone-500">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${myTasksGroup.idleIcon}`}
              >
                <ListTodo className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="text-ink text-[11px] font-bold tracking-[0.14em] dark:text-stone-300">My tasks</span>
            </div>
            <ul className="border-line ml-2 space-y-0.5 border-l border-dashed pl-2 dark:border-line-dark" role="list">
              {TASK_STATUS_SIDEBAR.map(({ param, label, countKey }) => {
                const count = taskKpis?.[countKey]
                const displayCount = taskKpisPending && count === undefined ? '–' : String(count ?? 0)
                const isActive = location.pathname === '/' && taskStatusParam === param
                return (
                  <li key={param}>
                    <NavLink
                      to={{ pathname: '/', search: `?taskStatus=${param}` }}
                      className={`group relative flex items-center justify-between gap-2 overflow-hidden rounded-lg py-2 pr-2 pl-3 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? `bg-gradient-to-r text-stitch-on-surface shadow-sm ring-1 dark:text-stone-100 ${myTasksGroup.activeRow}`
                          : 'text-ink-muted hover:bg-white/75 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/85 dark:hover:text-stone-100'
                      }`}
                    >
                      <span className="relative z-10 min-w-0 flex-1 truncate">{label}</span>
                      <span
                        className={`relative z-10 tabular-nums rounded-lg px-2 py-0.5 text-xs font-bold ${
                          isActive
                            ? 'bg-white/55 text-stitch-on-surface dark:bg-stone-900/40 dark:text-stone-100'
                            : 'bg-stone-200/80 text-ink dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {displayCount}
                      </span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>

          <Link
            to="/"
            aria-current={overviewNavActive ? 'page' : undefined}
            className={`group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              overviewNavActive
                ? `bg-gradient-to-r text-stitch-on-surface shadow-sm ring-1 dark:text-stone-100 ${overviewNav.activeRow}`
                : 'text-ink-muted hover:bg-white/75 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/85 dark:hover:text-stone-100'
            }`}
          >
            <motion.span
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br transition-all ${
                overviewNavActive
                  ? overviewNav.activeIcon
                  : `${overviewNav.idleIcon} group-hover:brightness-105 dark:group-hover:brightness-110`
              }`}
              whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -3 }}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              <OverviewNavIcon className="h-[18px] w-[18px]" aria-hidden />
            </motion.span>
            <span className="relative z-10 flex-1">{overviewNav.label}</span>
          </Link>

          <NavLink
            to="/companies"
            className={({ isActive }) =>
              `group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? `bg-gradient-to-r text-stitch-on-surface shadow-sm ring-1 dark:text-stone-100 ${clientsNav.activeRow}`
                  : 'text-ink-muted hover:bg-white/75 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/85 dark:hover:text-stone-100'
              }`
            }
          >
            {({ isActive }) => {
              const Icon = clientsNav.icon
              return (
                <>
                  <motion.span
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br transition-all ${
                      isActive ? clientsNav.activeIcon : `${clientsNav.idleIcon} group-hover:brightness-105 dark:group-hover:brightness-110`
                    }`}
                    whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -3 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </motion.span>
                  <span className="relative z-10 flex-1">{clientsNav.label}</span>
                </>
              )
            }}
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? `bg-gradient-to-r text-stitch-on-surface shadow-sm ring-1 dark:text-stone-100 ${settingsNav.activeRow}`
                  : 'text-ink-muted hover:bg-white/75 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/85 dark:hover:text-stone-100'
              }`
            }
          >
            {({ isActive }) => {
              const Icon = settingsNav.icon
              return (
                <>
                  <motion.span
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br transition-all ${
                      isActive ? settingsNav.activeIcon : `${settingsNav.idleIcon} group-hover:brightness-105 dark:group-hover:brightness-110`
                    }`}
                    whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -3 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </motion.span>
                  <span className="relative z-10 flex-1">{settingsNav.label}</span>
                </>
              )
            }}
          </NavLink>
        </nav>

        <div className="border-line border-t px-3 pt-2 pb-1 dark:border-line-dark">
          <QuickActionsSidebarTrigger onOpen={() => setQuickActionsOpen(true)} />
        </div>

        <WeekProgressCard />
      </aside>

      <div className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'pl-64' : 'pl-0'}`}>
        <header className="border-line sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-gradient-to-r from-white/88 via-paper/90 to-lume-violet/8 px-6 py-3 backdrop-blur-xl dark:border-line-dark dark:from-stone-950/88 dark:via-paper-dark/92 dark:to-violet-950/25">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!sidebarOpen ? (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="border-line text-ink-muted hover:ring-[#ec6f9d]/30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white/90 shadow-sm transition hover:shadow-md dark:border-line-dark dark:bg-stone-900/90 dark:hover:ring-pink-500/25"
                aria-label="Open sidebar"
                aria-controls="app-sidebar"
                aria-expanded={sidebarOpen}
              >
                <PanelLeft className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {!sidebarOpen ? accountMenuEl : null}
            <WeatherVibes />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/time"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 shadow-sm transition hover:bg-[#fd8863]/25 dark:bg-stone-800/90 dark:hover:bg-orange-900/30 ${
                location.pathname === '/time' ? 'ring-2 ring-[#9b3e20]/45 dark:ring-orange-400/50' : ''
              }`}
              aria-label="Working time"
            >
              <Clock className="text-ink-muted h-5 w-5 dark:text-stone-400" aria-hidden />
            </Link>
            <Link
              to={location.pathname === '/calendar' ? '/' : '/calendar'}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 shadow-sm transition hover:bg-[#97daff]/30 dark:bg-stone-800/90 dark:hover:bg-cyan-900/40 ${
                location.pathname === '/calendar' ? 'ring-2 ring-[#006384]/45 dark:ring-cyan-400/50' : ''
              }`}
              aria-label={location.pathname === '/calendar' ? 'Close calendar' : 'Calendar'}
            >
              <CalendarDays className="text-ink-muted h-5 w-5 dark:text-stone-400" aria-hidden />
            </Link>
            {timer.open ? (
              <div className="border-line flex max-w-[min(100%,14rem)] items-center gap-2 rounded-2xl border bg-white/90 px-2 py-1.5 shadow-sm dark:border-line-dark dark:bg-stone-800/90">
                <Clock className="text-ink-muted h-4 w-4 shrink-0 dark:text-stone-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-[#302e2b] dark:text-stone-200">{timer.open.positionTitle}</p>
                  <p className="text-ink text-xs font-semibold tabular-nums dark:text-stone-200">{formatTimer(timer.elapsedSeconds)}</p>
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
              <Bell className="text-ink-muted h-5 w-5 dark:text-stone-400" aria-hidden />
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
