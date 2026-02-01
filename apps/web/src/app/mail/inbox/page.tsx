"use client";

/**
 * Inbox Page Component
 * Multi-domain inbox with unified and domain-specific views
 * URL: /mail/inbox (unified) or /mail/inbox?domain=example.com (filtered)
 */

import { useState, useCallback, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Settings, HelpCircle } from "lucide-react";
import { cn } from "@email/ui";

import {
  useMailStore,
  useEmails,
  DomainFilterToolbar,
  EmailList,
  AdvancedSearchBar,
  parseSearchQuery,
  type EmailListItem,
  type EmailListQuery,
  type Domain,
} from "@/lib/mail";

// ============================================================
// EMAIL PREVIEW PANE
// ============================================================

interface EmailPreviewPaneProps {
  email: EmailListItem | null;
  onClose: () => void;
}

function EmailPreviewPane({ email, onClose }: EmailPreviewPaneProps) {
  if (!email) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-neutral-900">
        <div className="text-center text-neutral-500 dark:text-neutral-400">
          <p>Select an email to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900">
      {/* Preview header */}
      <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
            {email.subject || "(No subject)"}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">{email.from.name || email.from.address}</span>
            {email.from.name && (
              <span className="text-neutral-400 dark:text-neutral-500">
                &lt;{email.from.address}&gt;
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            To: {email.to.map((t) => t.name || t.address).join(", ")}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-4 rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Preview body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="prose dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
            {email.snippet || "Loading email content..."}
          </p>
        </div>
      </div>
    </div>
  );
}

  );
}

// ============================================================
// INBOX CONTENT (needs Suspense boundary for useSearchParams)
// ============================================================

function InboxContent() {
  const router = useRouter();
  const { activeDomain, activeMailbox, activeFolder, domains, viewPreferences, setQuery } =
    useMailStore();

  // Local state
  const [searchValue, setSearchValue] = useState("");
  const [previewEmail, setPreviewEmail] = useState<EmailListItem | null>(null);

  // Get current domain name for display
  const currentDomainName = useMemo(() => {
    if (activeDomain === "all") return null;
    const domain = domains.find((d: Domain) => d.id === activeDomain);
    return domain?.domain ?? null;
  }, [activeDomain, domains]);

  // Fetch emails
  const emailQuery = useMemo(() => {
    const query: {
      domain: string;
      folder: string;
      mailboxId?: string;
      folderId?: string;
      search?: string;
      read?: boolean;
      page: number;
      pageSize: number;
      sortBy: "date";
      sortOrder: "desc";
    } = {
      domain: activeDomain,
      folder: activeFolder?.type ?? "inbox",
      page: 1,
      pageSize: 50,
      sortBy: "date",
      sortOrder: "desc",
    };
    if (activeMailbox?.id) query.mailboxId = activeMailbox.id;
    if (activeFolder?.id) query.folderId = activeFolder.id;
    if (searchValue) query.search = searchValue;
    if (viewPreferences.showUnreadOnly) query.read = false;
    return query;
  }, [activeDomain, activeMailbox, activeFolder, searchValue, viewPreferences.showUnreadOnly]);

  const { data, isLoading, refetch, isRefetching } = useEmails(emailQuery as EmailListQuery);
  const emails = data?.emails ?? [];

  // Handle search
  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (value) {
        setQuery({ search: value });
      }
    },
    [setQuery]
  );

  const clearSearch = useCallback(() => {
    setSearchValue("");
  }, []);

  // Handle email click
  const handleEmailClick = useCallback(
    (email: EmailListItem) => {
      if (viewPreferences.previewPane !== "none") {
        setPreviewEmail(email);
      } else {
        // Navigate to email detail page
        router.push(`/mail/inbox/${email.id}`);
      }
    },
    [viewPreferences.previewPane, router]
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Get folder name for title
  const folderTitle = useMemo(() => {
    if (activeFolder) {
      return activeFolder.name;
    }
    return "Inbox";
  }, [activeFolder]);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex-shrink-0 border-b border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-bold text-neutral-900 dark:text-white">
              {folderTitle}
            </h1>
            {currentDomainName && (
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {currentDomainName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AdvancedSearchBar
              value={searchValue}
              onChange={handleSearch}
              onClear={clearSearch}
              recentSearches={[]}
              contacts={[]}
              className="max-w-xl flex-1"
            />
            <button
              onClick={handleRefresh}
              disabled={isRefetching}
              className={cn(
                "rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                isRefetching && "animate-spin"
              )}
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Help"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Domain filter toolbar */}
        <div className="mt-4">
          <DomainFilterToolbar />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Email list */}
        <div
          className={cn(
            "flex-shrink-0 border-r border-neutral-200 dark:border-neutral-800",
            viewPreferences.previewPane !== "none" ? "w-96" : "flex-1"
          )}
        >
          <EmailList
            emails={emails}
            isLoading={isLoading}
            isRefreshing={isRefetching}
            showDomainBadges={activeDomain === "all"}
            folder={activeFolder?.type ?? "inbox"}
            onRefresh={handleRefresh}
            onEmailClick={(emailId) => {
              const email = emails.find((e) => e.id === emailId);
              if (email) handleEmailClick(email);
            }}
          />
        </div>

        {/* Preview pane (if enabled) */}
        {viewPreferences.previewPane !== "none" && (
          <EmailPreviewPane email={previewEmail} onClose={() => setPreviewEmail(null)} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// LOADING FALLBACK
// ============================================================

function InboxLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>Loading inbox...</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE EXPORT
// ============================================================

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxLoading />}>
      <InboxContent />
    </Suspense>
  );
}
