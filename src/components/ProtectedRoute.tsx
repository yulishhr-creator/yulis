import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'
import { BrandLoader } from '@/components/ui/BrandLoader'

export function ProtectedRoute() {
  const { user, loading, configured } = useAuth()
  const location = useLocation()

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da550c' },
      body: JSON.stringify({
        sessionId: 'da550c',
        runId: 'pre',
        hypothesisId: 'H5',
        location: 'ProtectedRoute.tsx:guard',
        message: 'protected route snapshot',
        data: { configured, loading, hasUser: Boolean(user), path: location.pathname },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [configured, loading, user, location.pathname])

  if (!configured) {
    return <Navigate to="/setup" replace state={{ from: location }} />
  }

  if (loading) {
    return <BrandLoader />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
