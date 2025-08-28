import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { I18nProvider } from '@/contexts/I18nContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AppShell } from '@/components/app-shell'
import { LoginPage } from '@/pages/login'
import { MailPage } from '@/pages/mail'
import { CalendarPage } from '@/pages/calendar'
import { ChatPage } from '@/pages/chat'
import { SettingsPage } from '@/pages/settings'
import { QuarantinePage } from '@/pages/quarantine'
import '@/styles/theme.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function AppRoutes() {
  const { isAuthenticated, isLoading, user } = useAuth()

  console.log('AppRoutes render:', { isAuthenticated, isLoading, user })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="app-shell">
      <AppShell />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/mail" replace />} />
          <Route path="/mail/*" element={<MailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/quarantine" element={<QuarantinePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="ceerion-mail-theme">
        <I18nProvider>
          <AuthProvider>
            <TooltipProvider>
              <Router>
                <AppRoutes />
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    className: 'rounded-2xl',
                    duration: 4000,
                  }}
                />
              </Router>
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
