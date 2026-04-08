import { Link, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Settings,
  Menu,
  X,
  CloudSun,
  Sparkles,
  User,
  LogOut,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useWeatherLine } from '@/hooks/useWeatherLine'
import { AppLogo } from '@/components/ui/AppLogo'
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet'
import { UserAvatar } from '@/components/ui/UserAvatar'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/positions', label: 'Positions', icon: Briefcase },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const weather = useWeatherLine()
  const reduceMotion = useReducedMotion()

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'there'
  const metaName = (user?.user_metadata?.full_name as string | undefined) ?? ''

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
        <div className="bg-accent/[0.06] absolute top-0 right-0 h-[min(50vh,420px)] w-[min(50vw,420px)] rounded-full blur-3xl dark:bg-orange-500/10" />
        <div className="absolute bottom-0 left-0 h-[min(40vh,360px)] w-[min(45vw,360px)] rounded-full bg-amber-400/[0.07] blur-3xl dark:bg-amber-500/10" />
      </div>

      <a
        href="#main"
        className="focus:ring-accent sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] transition-opacity lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`border-line bg-paper/90 fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r backdrop-blur-xl transition-transform duration-300 ease-out lg:translate-x-0 dark:border-line-dark dark:bg-paper-dark/92 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-4 dark:border-line-dark">
          <Link to="/" className="min-w-0" onClick={() => setOpen(false)}>
            <AppLogo size="sm" />
          </Link>
          <button
            type="button"
            className="hover:bg-accent-soft/50 rounded-lg p-2 transition lg:hidden dark:hover:bg-stone-800"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-soft text-ink shadow-sm ring-1 ring-accent/25 dark:bg-stone-800 dark:text-stone-100 dark:ring-orange-400/20'
                    : 'text-ink-muted hover:bg-accent-soft/70 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800/90 dark:hover:text-stone-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                      isActive
                        ? 'bg-accent/15 text-accent dark:bg-orange-400/20 dark:text-orange-300'
                        : 'bg-white/60 text-ink-muted group-hover:bg-accent/10 group-hover:text-accent dark:bg-stone-900/50 dark:group-hover:text-orange-300'
                    }`}
                    whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -3 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </motion.span>
                  <span className="relative z-10">{label}</span>
                  {isActive ? (
                    <motion.span
                      layoutId="nav-pill"
                      className="bg-accent/8 absolute inset-0 rounded-xl dark:bg-orange-400/10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-line relative border-t p-3 dark:border-line-dark">
          <div className="text-ink-muted flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase dark:text-stone-500">
            <Sparkles className="text-accent h-3.5 w-3.5 dark:text-orange-400" aria-hidden />
            Quick
          </div>
          <p className="text-ink-muted mt-2 text-xs leading-relaxed dark:text-stone-500">
            Tip: use <span className="text-accent font-medium dark:text-orange-300">Email company</span> from a record to open Gmail with context.
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-line bg-paper/75 sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-xl dark:border-line-dark dark:bg-paper-dark/75">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="hover:bg-accent-soft/50 rounded-xl p-2 transition lg:hidden dark:hover:bg-stone-800"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <motion.div
              className="min-w-0"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <p className="font-display text-ink truncate text-sm font-semibold md:text-base dark:text-stone-100">
                {greeting()}, {displayName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {weather ? (
                  <motion.span
                    className="border-line bg-accent-soft/50 text-ink inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium dark:border-line-dark dark:bg-stone-800/80 dark:text-stone-300"
                    initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 }}
                  >
                    <CloudSun className="text-accent h-3.5 w-3.5 shrink-0 dark:text-orange-300" aria-hidden />
                    {weather}
                  </motion.span>
                ) : null}
              </div>
            </motion.div>
          </div>

          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="border-line hover:ring-accent/25 flex items-center gap-2 rounded-full border bg-white/80 py-1 pr-1 pl-1 shadow-sm transition hover:shadow-md dark:border-line-dark dark:bg-stone-900/80 dark:hover:ring-orange-400/20"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <UserAvatar email={user?.email} name={metaName} size="sm" />
              <span className="text-ink-muted hidden pr-2 text-xs font-medium sm:inline dark:text-stone-400">Account</span>
            </button>
            {menuOpen ? (
              <motion.div
                role="menu"
                className="border-line bg-paper absolute top-full right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <Link
                  to="/settings/profile"
                  role="menuitem"
                  className="hover:bg-accent-soft/60 flex items-center gap-2 px-3 py-2.5 text-sm dark:hover:bg-stone-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-4 w-4 opacity-70" aria-hidden />
                  Profile
                </Link>
                <Link
                  to="/settings"
                  role="menuitem"
                  className="hover:bg-accent-soft/60 flex items-center gap-2 px-3 py-2.5 text-sm dark:hover:bg-stone-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 opacity-70" aria-hidden />
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="hover:bg-accent-soft/60 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm dark:hover:bg-stone-800"
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
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  )
}
