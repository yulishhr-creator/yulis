import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'
import { BrandLoader } from '@/components/ui/BrandLoader'

export function ProtectedRoute() {
  const { user, loading, configured } = useAuth()
  const location = useLocation()

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
