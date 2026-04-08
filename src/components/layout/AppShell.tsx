import { Link, NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Building2, Briefcase, Settings, Menu, X } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useWeatherLine } from '@/hooks/useWeatherLine'

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
  const weather = useWeatherLine()

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="bg-paper text-ink min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <a
        href="#main"
        className="focus:ring-accent sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      {/* Mobile overlay */}
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`border-line bg-paper/95 fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r backdrop-blur dark:border-line-dark dark:bg-paper-dark/95 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-4 dark:border-line-dark">
          <Link to="/" className="font-display text-ink text-lg font-semibold tracking-tight dark:text-stone-100">
            Yuli’s HR
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 lg:hidden"
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
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-ink dark:bg-stone-800 dark:text-stone-100'
                    : 'text-ink-muted hover:bg-accent-soft/60 dark:text-stone-400 dark:hover:bg-stone-800/80'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-line border-t p-3 text-xs text-ink-muted dark:border-line-dark">
          <p className="truncate">{user?.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-accent mt-2 font-medium hover:underline dark:text-orange-300"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-line bg-paper/80 sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur dark:border-line-dark dark:bg-paper-dark/80">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="font-display text-ink text-sm font-semibold md:text-base dark:text-stone-100">
                {greeting()}, {displayName}
              </p>
              {weather ? (
                <p className="text-ink-muted text-xs md:text-sm dark:text-stone-400">{weather}</p>
              ) : null}
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
