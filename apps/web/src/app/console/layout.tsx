"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  KeyRound,
  BarChart3,
  Webhook,
  ShieldBan,
  FileText,
  CreditCard,
  Settings,
  ChevronDown,
  LogOut,
  Mail,
  Menu,
  X,
} from "lucide-react";
import { useCurrentUser } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/console", label: "Dashboard", icon: LayoutDashboard },
  { href: "/console/domains", label: "Domains", icon: Globe },
  { href: "/console/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/console/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/console/activity", label: "Activity", icon: Mail },
  { href: "/console/templates", label: "Templates", icon: FileText },
  { href: "/console/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/console/suppressions", label: "Suppressions", icon: ShieldBan },
  { href: "/console/billing", label: "Billing", icon: CreditCard },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login?redirect=/console");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.profile.displayName ?? user.email.split("@")[0] ?? "User";
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-gray-950 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <Link href="/console" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <Mail className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold">OonruMail</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/console" ? pathname === "/console" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
          <div className="border-t border-white/10 p-3">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-white"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                  {displayInitial}
                </div>
                <span className="flex-1 truncate text-left">{displayName}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl">
                  <button
                    onClick={() => {
                      localStorage.removeItem("token");
                      router.push("/login");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center border-b border-white/10 px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 font-semibold">OonruMail</span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
