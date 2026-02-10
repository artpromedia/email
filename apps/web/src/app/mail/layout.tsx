"use client";

/**
 * Mail Layout Component
 * Provides the main structure for the mail application with sidebar
 */

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Menu, X, Loader2 } from "lucide-react";
import { cn } from "@email/ui";

import { MailSidebar, useDomains, useMailStore, useMailWebSocket } from "@/lib/mail";

// ============================================================
// QUERY CLIENT PROVIDER
// ============================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// ============================================================
// MAIL LAYOUT INNER (needs to be inside QueryClientProvider)
// ============================================================

interface MailLayoutInnerProps {
  children: React.ReactNode;
}

function MailLayoutInner({ children }: MailLayoutInnerProps) {
  const searchParams = useSearchParams();
  const { setActiveDomain, setDomains } = useMailStore();

  // Fetch domains
  const { data: domains = [] } = useDomains();

  // Initialize WebSocket for real-time updates
  useMailWebSocket();

  // Sync domains to store
  useEffect(() => {
    if (domains.length > 0) {
      setDomains(domains);
    }
  }, [domains, setDomains]);

  // Handle URL domain filter
  useEffect(() => {
    const domainParam = searchParams.get("domain");
    if (domainParam) {
      // Find domain by name
      const domain = domains.find((d) => d.domain === domainParam);
      if (domain) {
        setActiveDomain(domain.id);
      }
    } else {
      setActiveDomain("all"); // Unified view
    }
  }, [searchParams, domains, setActiveDomain]);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950">
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

          <MailSidebar />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with menu button */}
        <header className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 lg:hidden">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">Mail</h1>
        </header>

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

// ============================================================
// MAIN LAYOUT EXPORT
// ============================================================

// Loading fallback for Suspense
function MailLayoutLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<MailLayoutLoading />}>
        <MailLayoutInner>{children}</MailLayoutInner>
      </Suspense>
    </QueryClientProvider>
  );
}
