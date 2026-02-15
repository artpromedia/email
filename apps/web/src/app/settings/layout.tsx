"use client";

/**
 * Settings Layout - Wraps settings pages with navigation
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { User, Mail, Shield, Bell, Palette, Building2, Globe, Key, Loader2 } from "lucide-react";
import { DomainBrandingProvider, cn } from "@email/ui";
import { Header } from "@/components/layout";
import { useCurrentUser } from "@/lib/auth";

const settingsNav = [
  {
    title: "Account",
    items: [
      { href: "/settings/account", label: "Profile", icon: User },
      { href: "/settings/account/emails", label: "Email Addresses", icon: Mail },
      { href: "/settings/account/security", label: "Security", icon: Shield },
      { href: "/settings/account/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Preferences",
    items: [{ href: "/settings/preferences", label: "Appearance", icon: Palette }],
  },
  {
    title: "Organization",
    items: [
      { href: "/settings/organization", label: "General", icon: Building2 },
      { href: "/settings/organization/domains", label: "Domains", icon: Globe },
      { href: "/settings/organization/sso", label: "Single Sign-On", icon: Key },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !user) {
      const redirectPath = encodeURIComponent(pathname || "/settings/account");
      router.replace(`/login?redirect=${redirectPath}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

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

  return (
    <DomainBrandingProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="container flex-1 py-6">
          <div className="flex flex-col gap-8 lg:flex-row">
            {/* Settings Navigation */}
            <aside className="flex-shrink-0 lg:w-64">
              <nav className="space-y-6">
                {settingsNav.map((section) => (
                  <div key={section.title}>
                    <h4 className="mb-2 px-3 text-sm font-medium text-muted-foreground">
                      {section.title}
                    </h4>
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                isActive
                                  ? "bg-accent font-medium text-accent-foreground"
                                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </aside>

            {/* Settings Content */}
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </div>
    </DomainBrandingProvider>
  );
}
