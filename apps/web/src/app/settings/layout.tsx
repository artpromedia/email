"use client";

/**
 * Settings Layout - Wraps settings pages with navigation
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Mail,
  Shield,
  Bell,
  Palette,
  Building2,
  Globe,
  Key,
} from "lucide-react";
import { DomainBrandingProvider, cn } from "@email/ui";
import { Header } from "@/components/layout";

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
    items: [
      { href: "/settings/preferences", label: "Appearance", icon: Palette },
    ],
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

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <DomainBrandingProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 container py-6">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Settings Navigation */}
            <aside className="lg:w-64 flex-shrink-0">
              <nav className="space-y-6">
                {settingsNav.map((section) => (
                  <div key={section.title}>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2 px-3">
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
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                                isActive
                                  ? "bg-accent text-accent-foreground font-medium"
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </DomainBrandingProvider>
  );
}
