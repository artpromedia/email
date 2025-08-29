import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import { AdminRoute } from './components/AdminRoute'
import { AdminLogin } from './pages/AdminLogin'
import { AdminDashboard } from './pages/AdminDashboard'
import { UserManagement } from './pages/UserManagement'
import { QuarantineManagement } from './pages/QuarantineManagement'
import { DeliverabilityDashboard } from './pages/DeliverabilityDashboard'
import { PolicyManagement } from './pages/PolicyManagement'
import { AuditLog } from './pages/AuditLog'
import { AdminLayout } from './components/AdminLayout'

function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="quarantine" element={<QuarantineManagement />} />
          <Route path="deliverability" element={<DeliverabilityDashboard />} />
          <Route path="policies" element={<PolicyManagement />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  )
}

export default App
