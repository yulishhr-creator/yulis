import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from '@/auth/AuthProvider'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppSplash } from '@/components/ui/AppSplash'
import { ToastProvider } from '@/components/ui/toast-context'
import { LoginPage } from '@/pages/LoginPage'
import { SetupPage } from '@/pages/SetupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TasksPage } from '@/pages/TasksPage'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { CompanyDetailPage } from '@/pages/CompanyDetailPage'
import { PositionsPage } from '@/pages/PositionsPage'
import { PositionDetailPage } from '@/pages/PositionDetailPage'
import { PositionFeesPage } from '@/pages/PositionFeesPage'
import { PositionFeesListPage } from '@/pages/PositionFeesListPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { EmailTemplatesPage } from '@/pages/EmailTemplatesPage'
import { ListSettingsPage } from '@/pages/ListSettingsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { WorkingTimePage } from '@/pages/WorkingTimePage'
import { CalendarPage } from '@/pages/CalendarPage'
import { CandidatesPage } from '@/pages/CandidatesPage'
import { CandidateDetailPage } from '@/pages/CandidateDetailPage'
import { PublicSharePage } from '@/pages/PublicSharePage'
import { PublicPositionCandidatesPage } from '@/pages/PublicPositionCandidatesPage'
import { WorkTimerProvider } from '@/work/WorkTimerContext'

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
      <ToastProvider>
        <BrowserRouter>
          <AppSplash>
            <AuthProvider>
              <Routes>
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/p/:token" element={<PublicSharePage />} />
                <Route path="/pub/pos/:token" element={<PublicPositionCandidatesPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route
                    element={
                      <WorkTimerProvider>
                        <AppShell />
                      </WorkTimerProvider>
                    }
                  >
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/time" element={<WorkingTimePage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/companies" element={<CompaniesPage />} />
                    <Route path="/companies/:id" element={<CompanyDetailPage />} />
                    <Route path="/candidates" element={<CandidatesPage />} />
                    <Route path="/candidates/:id" element={<CandidateDetailPage />} />
                    <Route path="/positions" element={<PositionsPage />} />
                    <Route path="/positions/:id" element={<PositionDetailPage />} />
                    <Route path="/settings/positions/:id/fees" element={<PositionFeesPage />} />
                    <Route path="/settings/position-fees" element={<PositionFeesListPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/profile" element={<ProfilePage />} />
                    <Route path="/settings/email-templates" element={<EmailTemplatesPage />} />
                    <Route path="/settings/lists" element={<ListSettingsPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </AppSplash>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
