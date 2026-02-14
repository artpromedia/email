/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */

"use client";

/**
 * Domain Switcher Header Component
 *
 * Features:
 * - Display current domain with branding
 * - Dropdown to switch between domains
 * - User menu with profile and logout
 * - Responsive design
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Settings,
  User,
  Mail,
  Shield,
  Building2,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import {
  Button,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  DomainAvatar,
  useDomain,
  cn,
} from "@email/ui";
import { useCurrentUser, useLogout, type AuthUser } from "@/lib/auth";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const router = useRouter();
  const { data: user, isLoading: isLoadingUser } = useCurrentUser();
  const logoutMutation = useLogout();

  const [showDomainMenu, setShowDomainMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Domain context
  const {
    activeDomain,
    availableDomains: domains,
    switchDomain,
    branding: activeDomainBranding,
  } = useDomain();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    router.push("/login");
  };

  const handleDomainSwitch = (domainId: string) => {
    switchDomain(domainId);
    setShowDomainMenu(false);
  };

  // Get user initials for avatar fallback
  const getUserInitials = (user: AuthUser | undefined) => {
    if (!user?.profile) return "U";
    const { firstName, lastName, displayName } = user.profile;
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (displayName) {
      return displayName.slice(0, 2).toUpperCase();
    }
    return user.email.slice(0, 2).toUpperCase();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="container flex h-14 items-center justify-between">
        {/* Left: Logo + Domain Switcher */}
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            {activeDomainBranding.logo ? (
              <img
                src={activeDomainBranding.logo}
                alt={activeDomainBranding.displayName || "Email"}
                className="h-8 w-auto"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: activeDomainBranding.primaryColor || "var(--primary)",
                }}
              >
                <Mail className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <span className="hidden font-semibold sm:inline-block">
              {activeDomainBranding.displayName || "OonruMail"}
            </span>
          </Link>

          {/* Domain Switcher */}
          {domains.length > 1 && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDomainMenu(!showDomainMenu)}
                className="gap-2 px-3"
              >
                <DomainAvatar name={activeDomain} domain={activeDomain} size="sm" />
                <span className="hidden max-w-[150px] truncate md:inline-block">
                  {activeDomain}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>

              {/* Domain Dropdown */}
              {showDomainMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDomainMenu(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border bg-popover shadow-lg">
                    <div className="p-2">
                      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Switch Domain
                      </p>
                      <div className="mt-1 space-y-1">
                        {domains.map((domain: string) => {
                          const isActive = domain === activeDomain;
                          return (
                            <button
                              key={domain}
                              onClick={() => handleDomainSwitch(domain)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                                isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                              )}
                            >
                              <DomainAvatar name={domain} domain={domain} size="sm" />
                              <div className="flex-1 text-left">
                                <p className="truncate font-medium">{domain}</p>
                              </div>
                              {isActive && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="border-t p-2">
                      <Link
                        href="/settings/domains"
                        onClick={() => setShowDomainMenu(false)}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/50"
                      >
                        <Plus className="h-4 w-4" />
                        Add domain
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: User Menu */}
        <div className="flex items-center gap-2">
          {isLoadingUser ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : user ? (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="gap-2 px-2"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.profile.avatarUrl} />
                  <AvatarFallback className="text-xs">{getUserInitials(user)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[120px] truncate sm:inline-block">
                  {user.profile.displayName || user.profile.firstName || user.email.split("@")[0]}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>

              {/* User Dropdown */}
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover shadow-lg">
                    {/* User Info */}
                    <div className="border-b p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.profile.avatarUrl} />
                          <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {user.profile.displayName ||
                              `${user.profile.firstName ?? ""} ${
                                user.profile.lastName ?? ""
                              }`.trim() ||
                              user.email.split("@")[0]}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      {user.role !== "user" && (
                        <Badge variant="secondary" className="mt-2">
                          {user.role.replace("_", " ")}
                        </Badge>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <Link
                        href="/settings/account"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <User className="h-4 w-4" />
                        Account Settings
                      </Link>
                      <Link
                        href="/settings/account/emails"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <Mail className="h-4 w-4" />
                        Email Addresses
                      </Link>
                      <Link
                        href="/settings/account/security"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <Shield className="h-4 w-4" />
                        Security
                      </Link>
                      {(user.role === "org_admin" || user.role === "super_admin") && (
                        <Link
                          href="/settings/organization"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                        >
                          <Building2 className="h-4 w-4" />
                          Organization
                        </Link>
                      )}
                      {(user.role === "domain_admin" ||
                        user.role === "org_admin" ||
                        user.role === "super_admin") && (
                        <Link
                          href="/admin"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                        >
                          <Shield className="h-4 w-4" />
                          Domain Admin
                        </Link>
                      )}
                      <Link
                        href="/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <Settings className="h-4 w-4" />
                        All Settings
                      </Link>
                    </div>

                    {/* Logout */}
                    <div className="border-t p-2">
                      <button
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        {logoutMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4" />
                        )}
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
