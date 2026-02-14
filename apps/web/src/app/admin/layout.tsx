"use client";

/**
 * Domain Admin Layout
 *
 * This layout provides the admin dashboard for domain administrators.
 * It includes a sidebar with navigation, domain selector, and auth guard.
 * This is separate from the platform admin (admin.oonrumail.com) —
 * this is the domain-level admin that users see in the web app.
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Globe,
  Shield,
  Settings,
  Menu,
  X,
  ArrowLeft,
  Loader2,
  Lock,
} from "lucide-react";
import { cn } from "@email/ui";
import { useCurrentUser } from "@/lib/auth";

// ============================================================
// NAV ITEMS
// ============================================================

const adminNavItems = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/admin/domains",
    label: "Domains",
    icon: Globe,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
  },
  {
    href: "/admin/dns",
    label: "DNS & DKIM",
    icon: Shield,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
  },
];

// ============================================================
// ADMIN SIDEBAR
// ============================================================

interface AdminSidebarProps {
  currentPath: string;
  onNavigate?: () => void;
}

function AdminSidebar({ currentPath, onNavigate }: Readonly<AdminSidebarProps>) {
  const { data: user } = useCurrentUser();

  const displayInitial = user
    ? (user.profile.firstName?.[0] ?? user.email[0]?.toUpperCase() ?? "A")
    : "A";
  const displayName = user
    ? (user.profile.displayName ??
        `${user.profile.firstName ?? ""} ${user.profile.lastName ?? ""}`.trim()) ||
      user.email.split("@")[0]
    : "";
  const displayRole = user?.role.replace("_", " ") ?? "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
        <Link
          href="/mail/inbox"
          className="mb-3 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Mail
        </Link>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Domain Admin
        </h2>
        {user && (
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{user.domain}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? currentPath === item.href
            : currentPath.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {displayInitial}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {displayName}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{displayRole}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH GUARD
// ============================================================

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login?redirect=/admin");
    }
  }, [isLoading, user, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user || isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Check role — allow super_admin, org_admin, domain_admin
  const allowedRoles = ["super_admin", "org_admin", "domain_admin"];
  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="mx-4 max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Lock className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Access Denied
          </h2>
          <p className="mb-6 text-neutral-600 dark:text-neutral-400">
            You don&apos;t have permission to access the admin panel. Contact your organization
            administrator for access.
          </p>
          <Link
            href="/mail/inbox"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Mail
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ============================================================
// MAIN LAYOUT
// ============================================================

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={closeSidebar}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSidebar();
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close sidebar"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 flex-shrink-0 lg:static",
            "transform transition-transform duration-300 ease-in-out lg:transform-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex h-full flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {/* Mobile close button */}
            <button
              onClick={closeSidebar}
              className="absolute right-3 top-3 rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>

            <AdminSidebar currentPath={pathname} onNavigate={closeSidebar} />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 lg:hidden">
            <button
              onClick={toggleSidebar}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Domain Admin
            </h1>
          </div>

          {/* Page content */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
