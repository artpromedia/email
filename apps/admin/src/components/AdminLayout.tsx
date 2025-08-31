import { Outlet, Link, useLocation } from "react-router-dom";
import { useAdminAuth } from "../contexts/AdminAuthContext";
import { useFeatureFlags } from "../config/featureFlags";
import { Button } from "./ui/button";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Shield,
  TrendingUp,
  Settings,
  FileText,
  LogOut,
  Menu,
  Upload,
  Download,
} from "lucide-react";
import { useState } from "react";

export function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const featureFlags = useFeatureFlags();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Build navigation based on feature flags
  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      enabled: true,
    },
    { name: "Users", href: "/users", icon: Users, enabled: true },
    {
      name: "Import Users",
      href: "/users/import",
      icon: Upload,
      enabled: true,
    },
    {
      name: "Export Users",
      href: "/users/export",
      icon: Download,
      enabled: true,
    },
    { name: "Groups", href: "/groups", icon: UserCheck, enabled: true },
    {
      name: "Quarantine",
      href: "/quarantine",
      icon: Shield,
      enabled: featureFlags.ADMIN_QUARANTINE_ENABLED,
    },
    {
      name: "Deliverability",
      href: "/deliverability",
      icon: TrendingUp,
      enabled: featureFlags.ADMIN_DELIVERABILITY_ENABLED,
    },
    {
      name: "Policies",
      href: "/policies",
      icon: Settings,
      enabled: featureFlags.ADMIN_POLICIES_ENABLED,
    },
    {
      name: "Audit Log",
      href: "/audit",
      icon: FileText,
      enabled: featureFlags.ADMIN_AUDITLOG_ENABLED,
    },
  ].filter((item) => item.enabled);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div
        className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-16 bg-blue-600 text-white">
            <h1 className="text-xl font-bold">CEERION Admin</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${
                      isActive
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info and logout */}
          <div className="p-4 border-t">
            <div className="flex items-center mb-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            <Button
              onClick={logout}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b h-16 flex items-center justify-between px-6 lg:hidden">
          <Button
            onClick={() => setSidebarOpen(true)}
            variant="ghost"
            size="icon"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-semibold">CEERION Admin</h1>
          <div></div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
