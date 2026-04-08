import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'

export function ProtectedRoute() {
  const { user, loading, configured } = useAuth()
  const location = useLocation()

  if (!configured) {
    return <Navigate to="/setup" replace state={{ from: location }} />
  }

  if (loading) {
    return (
      <div className="bg-paper text-ink-muted flex min-h-dvh items-center justify-center dark:bg-paper-dark">
        <p className="font-display text-lg">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
