// @ts-nocheck
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Toaster as SonnerToaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLogin } from "./pages/AdminLogin";
import { AdminLayout } from "./components/AdminLayout-simple";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  DashboardSkeleton,
  TableSkeleton,
  CardSkeleton,
} from "./components/Skeleton";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useConfirm } from "./hooks/useConfirm";
import { useFeatureFlags } from "./config/featureFlags";

import AdminDashboard from "./pages/AdminDashboard-minimal";
// const AdminDashboard = lazy(() => import("./pages/AdminDashboard-minimal"));
const UsersRoutes = lazy(() => import("./routes/users"));
const GroupsRoutes = lazy(() => import("./routes/groups"));
const AuditPage = lazy(() =>
  import("./routes/audit/AuditPage").then((module) => ({
    default: module.AuditPage,
  })),
);
const QuarantineManagement = lazy(() =>
  import("./pages/QuarantineManagement").then((module) => ({
    default: module.default,
  })),
);
const DeliverabilityDashboard = lazy(() =>
  import("./pages/DeliverabilityDashboard").then((module) => ({
    default: module.default,
  })),
);
const PolicyManagement = lazy(() =>
  import("./pages/PolicyManagement").then((module) => ({
    default: module.default,
  })),
);

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
  const featureFlags = useFeatureFlags();
  const confirmHook = useConfirm();

  return (
    <>
      {/* @ts-expect-error React Router typing issue */}
      <Routes>
        {/* @ts-expect-error React Router typing issue */}
        <Route path="/login" element={<AdminLogin />} />
        {/* @ts-expect-error React Router typing issue */}
        <Route
          path="/"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          {/* @ts-expect-error React Router typing issue */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* @ts-expect-error React Router typing issue */}
          <Route
            path="dashboard"
            element={
              <ErrorBoundary>
                <AdminDashboard />
              </ErrorBoundary>
            }
          />

          {/* @ts-expect-error React Router typing issue */}
          <Route
            path="users/*"
            element={
              <ErrorBoundary>
                <Suspense fallback={<TableSkeleton />}>
                  <UsersRoutes />
                </Suspense>
              </ErrorBoundary>
            }
          />

          <Route
            path="groups/*"
            element={
              <ErrorBoundary>
                <Suspense fallback={<TableSkeleton />}>
                  <GroupsRoutes />
                </Suspense>
              </ErrorBoundary>
            }
          />

          {featureFlags.ADMIN_QUARANTINE_ENABLED && (
            <Route
              path="quarantine"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<TableSkeleton />}>
                    <QuarantineManagement />
                  </Suspense>
                </ErrorBoundary>
              }
            />
          )}

          {featureFlags.ADMIN_DELIVERABILITY_ENABLED && (
            <Route
              path="deliverability"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<DashboardSkeleton />}>
                    <DeliverabilityDashboard />
                  </Suspense>
                </ErrorBoundary>
              }
            />
          )}

          {featureFlags.ADMIN_POLICIES_ENABLED && (
            <Route
              path="policies"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<CardSkeleton />}>
                    <PolicyManagement />
                  </Suspense>
                </ErrorBoundary>
              }
            />
          )}

          {featureFlags.ADMIN_AUDITLOG_ENABLED && (
            <Route
              path="audit"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<TableSkeleton />}>
                    <AuditPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
          )}
        </Route>
      </Routes>

      {/* Global Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmHook.isOpen}
        options={confirmHook.options}
        onConfirm={confirmHook.handleConfirm}
        onCancel={confirmHook.handleCancel}
      />

      {/* Toast Notifications */}
      <Toaster position="top-right" />
      <SonnerToaster position="top-right" />
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
