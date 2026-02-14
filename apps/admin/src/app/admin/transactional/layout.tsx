"use client";

/**
 * Transactional Email Layout
 * Sub-navigation for transactional email management sections
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Key, FileText, Webhook, ShieldBan, BarChart3, LayoutDashboard } from "lucide-react";
import { cn } from "@email/ui";

const subNavItems = [
  { href: "/admin/transactional", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/transactional/api-keys", label: "API Keys", icon: Key },
  { href: "/admin/transactional/templates", label: "Templates", icon: FileText },
  { href: "/admin/transactional/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/admin/transactional/suppressions", label: "Suppressions", icon: ShieldBan },
  { href: "/admin/transactional/analytics", label: "Analytics", icon: BarChart3 },
];

export default function TransactionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactional Email</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage API keys, templates, webhooks, and delivery settings
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-gray-100 p-1 dark:bg-gray-800">
        {subNavItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
