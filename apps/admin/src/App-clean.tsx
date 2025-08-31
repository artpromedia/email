import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAuthProvider } from "./contexts/AdminAuthContextSimple";
import { AdminRoute } from "./components/AdminRouteSimple";
import { AdminLogin } from "./pages/AdminLogin";
import { AdminLayout } from "./components/AdminLayout-simple";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AdminDashboard from "./pages/AdminDashboard-minimal";

// Lazy load the users component that we know works
const SimpleEnterpriseUsersList = lazy(
  () => import("./routes/users/SimpleEnterpriseUsersList"),
);
const UserDetailPage = lazy(() => import("./pages/UserDetailPage"));
const EditUserPage = lazy(() => import("./pages/EditUserPage"));
const AddUserPage = lazy(() => import("./pages/AddUserPage"));
const QuarantineManagement = lazy(() => import("./pages/QuarantineManagement"));
const AuditLogsManagement = lazy(() => import("./pages/AuditLogsManagement"));
const PolicyManagement = lazy(() => import("./components/PolicyManagement"));
const DomainManagement = lazy(() => import("./components/DomainManagement"));
const AnalyticsDashboard = lazy(() => import("./components/AnalyticsDashboard"));
const SystemSettings = lazy(() => import("./components/SystemSettings"));

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function AppContent() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route
          path="/"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <ErrorBoundary>
                <AdminDashboard />
              </ErrorBoundary>
            }
          />
          <Route
            path="users"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading users...</div>}>
                  <SimpleEnterpriseUsersList />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="users/:id"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading user details...</div>}>
                  <UserDetailPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="users/:id/edit"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading edit user form...</div>}>
                  <EditUserPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="users/new"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading add user form...</div>}>
                  <AddUserPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="quarantine"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading quarantine...</div>}>
                  <QuarantineManagement />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="audit-logs"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading audit logs...</div>}>
                  <AuditLogsManagement />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="policies"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading policies...</div>}>
                  <PolicyManagement />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="domains"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading domains...</div>}>
                  <DomainManagement />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="analytics"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading analytics...</div>}>
                  <AnalyticsDashboard />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="settings"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div>Loading system settings...</div>}>
                  <SystemSettings />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <AppContent />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
