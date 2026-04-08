import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from '@/auth/AuthProvider'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { SetupPage } from '@/pages/SetupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { PositionsPage } from '@/pages/PositionsPage'
import { PositionDetailPage } from '@/pages/PositionDetailPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { EmailTemplatesPage } from '@/pages/EmailTemplatesPage'
import { ListSettingsPage } from '@/pages/ListSettingsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/companies" element={<CompaniesPage />} />
                <Route path="/companies/:id" element={<CompanyDetailPage />} />
                <Route path="/positions" element={<PositionsPage />} />
                <Route path="/positions/:id" element={<PositionDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/email-templates" element={<EmailTemplatesPage />} />
                <Route path="/settings/lists" element={<ListSettingsPage />} />
                <Route path="/settings/integrations" element={<IntegrationsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
