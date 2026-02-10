"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Users, Globe, Settings, BarChart3, Shield, LogOut } from "lucide-react";
import { cn } from "@email/ui";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/domains", label: "Domains", icon: Globe },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/email-logs", label: "Email Logs", icon: Mail },
  { href: "/admin/security", label: "Security", icon: Shield },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-white dark:bg-gray-900">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Mail className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-gray-900 dark:text-white">Admin Portal</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t p-4">
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1">{children}</main>
    </div>
  );
}
