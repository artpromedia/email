"use client";

/**
 * Email List Component
 * Virtualized email list with multi-domain support
 */

import { useCallback, useRef, useEffect } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
  Archive,
  Trash2,
  Mail,
  MailOpen,
  Star,
  MoreHorizontal,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@email/ui";

import { useMailStore, type EmailListItem } from "@/lib/mail";

import { EmailListItemComponent, EmailListItemSkeleton } from "./EmailListItem";
import { EmailThreadGroup } from "./EmailThreadGroup";

// No-operation function for disabled handlers
const noop = () => {
  /* intentionally empty */
};

// ============================================================
// TOOLBAR COMPONENT
// ============================================================

interface EmailListToolbarProps {
  selectedCount: number;
  isAllSelected: boolean;
  hasSelection: boolean;
  isRefreshing: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkAsRead: () => void;
  onMarkAsUnread: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onStar: () => void;
  onRefresh: () => void;
}

function EmailListToolbar({
  selectedCount,
  isAllSelected,
  hasSelection,
  isRefreshing,
  onSelectAll,
  onClearSelection,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onDelete,
  onStar,
  onRefresh,
}: Readonly<EmailListToolbarProps>) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Select All Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={isAllSelected ? onClearSelection : onSelectAll}
          className={cn(
            "h-4 w-4 rounded border-neutral-300 text-blue-600",
            "focus:ring-blue-500 focus:ring-offset-0",
            "dark:border-neutral-600 dark:bg-neutral-800"
          )}
          aria-label={isAllSelected ? "Deselect all emails" : "Select all emails"}
        />
        <button
          className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Selection options"
          aria-haspopup="menu"
        >
          <ChevronDown className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        </button>
      </div>

      {/* Refresh Button */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          "rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
          isRefreshing && "animate-spin"
        )}
        aria-label={isRefreshing ? "Refreshing emails..." : "Refresh email list"}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

      {/* Bulk Actions (shown when items selected) */}
      {hasSelection ? (
        <>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {selectedCount} selected
          </span>

          <button
            onClick={onMarkAsRead}
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={`Mark ${selectedCount} selected email${selectedCount === 1 ? "" : "s"} as read`}
          >
            <MailOpen className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Mark as read</span>
          </button>

          <button
            onClick={onMarkAsUnread}
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={`Mark ${selectedCount} selected email${selectedCount === 1 ? "" : "s"} as unread`}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Mark as unread</span>
          </button>

          <button
            onClick={onStar}
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={`Star ${selectedCount} selected email${selectedCount === 1 ? "" : "s"}`}
          >
            <Star className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Star</span>
          </button>

          <button
            onClick={onArchive}
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={`Archive ${selectedCount} selected email${selectedCount === 1 ? "" : "s"}`}
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Archive</span>
          </button>

          <button
            onClick={onDelete}
            className="rounded p-2 text-red-600 hover:bg-neutral-100 dark:text-red-400 dark:hover:bg-neutral-800"
            aria-label={`Delete ${selectedCount} selected email${selectedCount === 1 ? "" : "s"}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Delete</span>
          </button>

          <button
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="More actions"
            aria-haspopup="menu"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">More actions</span>
          </button>
        </>
      ) : (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Select emails to perform actions
        </span>
      )}
    </div>
  );
}

// ============================================================
// EMPTY STATE COMPONENT
// ============================================================

interface EmailListEmptyProps {
  folder: string;
}

function EmailListEmpty({ folder }: Readonly<EmailListEmptyProps>) {
  const messages: Record<string, { title: string; description: string }> = {
    inbox: {
      title: "Your inbox is empty",
      description: "Emails you receive will appear here",
    },
    sent: {
      title: "No sent emails",
      description: "Emails you send will appear here",
    },
    drafts: {
      title: "No drafts",
      description: "Saved drafts will appear here",
    },
    trash: {
      title: "Trash is empty",
      description: "Deleted emails will appear here for 30 days",
    },
    starred: {
      title: "No starred emails",
      description: "Star important emails to find them quickly",
    },
    archive: {
      title: "No archived emails",
      description: "Archived emails will appear here",
    },
  };

  const message = messages[folder] ?? messages["inbox"];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Mail className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
      <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-white">
        {message?.title}
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{message?.description}</p>
    </div>
  );
}

// ============================================================
// MAIN EMAIL LIST COMPONENT
// ============================================================

interface EmailListProps {
  emails: EmailListItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  showDomainBadges: boolean;
  folder: string;
  onRefresh: () => void;
  onEmailClick: (emailId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

export function EmailList({
  emails,
  isLoading,
  isRefreshing,
  showDomainBadges,
  folder,
  onRefresh,
  onEmailClick,
  onLoadMore,
  hasMore,
  className,
}: Readonly<EmailListProps>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    selectedEmails,
    focusedEmailId,
    viewPreferences,
    selectEmail,
    toggleEmailSelection,
    selectAllEmails,
    clearSelection,
    setFocusedEmail,
    markAsRead,
    markAsUnread,
    starEmails,
    unstarEmails,
    deleteEmails,
    moveEmails,
  } = useMailStore();

  // Derived state
  const selectedCount = selectedEmails.size;
  const isAllSelected = emails.length > 0 && selectedEmails.size === emails.length;
  const hasSelection = selectedEmails.size > 0;

  // Virtualizer for large lists
  const rowVirtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => {
      switch (viewPreferences.density) {
        case "compact":
          return 52;
        case "cozy":
          return 88;
        default:
          return 72;
      }
    }, [viewPreferences.density]),
    overscan: 10,
  });

  // Load more when scrolling to bottom
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const items = rowVirtualizer.getVirtualItems();
    const lastItem = items.at(-1);

    if (lastItem && lastItem.index >= emails.length - 5) {
      onLoadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.length, onLoadMore, hasMore]);

  // Handle email selection
  const handleSelect = useCallback(
    (emailId: string, event: React.MouseEvent) => {
      if (event.shiftKey && focusedEmailId) {
        // Range selection
        const startIndex = emails.findIndex((e) => e.id === focusedEmailId);
        const endIndex = emails.findIndex((e) => e.id === emailId);
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        for (let i = from; i <= to; i++) {
          const email = emails[i];
          if (email) selectEmail(email.id);
        }
      } else {
        toggleEmailSelection(emailId);
      }
      setFocusedEmail(emailId);
    },
    [emails, focusedEmailId, selectEmail, toggleEmailSelection, setFocusedEmail]
  );

  // Handle email click
  const handleClick = useCallback(
    (emailId: string) => {
      setFocusedEmail(emailId);
      onEmailClick(emailId);
    },
    [setFocusedEmail, onEmailClick]
  );

  // Handle star
  const handleStar = useCallback(
    (emailId: string) => {
      const email = emails.find((e) => e.id === emailId);
      if (email?.isStarred) {
        unstarEmails([emailId]);
      } else {
        starEmails([emailId]);
      }
    },
    [emails, starEmails, unstarEmails]
  );

  // Handle quick action: Archive single email
  const handleQuickArchive = useCallback(
    (emailId: string) => {
      moveEmails([emailId], {
        domainId: "",
        mailboxId: "",
        folderId: "archive",
        folderName: "Archive",
        domainName: "",
      });
    },
    [moveEmails]
  );

  // Handle quick action: Delete single email
  const handleQuickDelete = useCallback(
    (emailId: string) => {
      deleteEmails([emailId]);
    },
    [deleteEmails]
  );

  // Handle quick action: Toggle read/unread single email
  const handleQuickToggleRead = useCallback(
    (emailId: string) => {
      const email = emails.find((e) => e.id === emailId);
      if (email?.isRead) {
        markAsUnread([emailId]);
      } else {
        markAsRead([emailId]);
      }
    },
    [emails, markAsRead, markAsUnread]
  );

  // Bulk action handlers
  const handleMarkAsRead = useCallback(() => {
    markAsRead(Array.from(selectedEmails));
  }, [selectedEmails, markAsRead]);

  const handleMarkAsUnread = useCallback(() => {
    markAsUnread(Array.from(selectedEmails));
  }, [selectedEmails, markAsUnread]);

  const handleArchive = useCallback(() => {
    // Move to archive folder
    moveEmails(Array.from(selectedEmails), {
      domainId: "",
      mailboxId: "",
      folderId: "archive",
      folderName: "Archive",
      domainName: "",
    });
  }, [selectedEmails, moveEmails]);

  const handleDelete = useCallback(() => {
    deleteEmails(Array.from(selectedEmails));
  }, [selectedEmails, deleteEmails]);

  const handleBulkStar = useCallback(() => {
    starEmails(Array.from(selectedEmails));
  }, [selectedEmails, starEmails]);

  if (isLoading && emails.length === 0) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <EmailListToolbar
          selectedCount={0}
          isAllSelected={false}
          hasSelection={false}
          isRefreshing
          onSelectAll={noop}
          onClearSelection={noop}
          onMarkAsRead={noop}
          onMarkAsUnread={noop}
          onArchive={noop}
          onDelete={noop}
          onStar={noop}
          onRefresh={onRefresh}
        />
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <EmailListItemSkeleton key={`skeleton-${i}`} density={viewPreferences.density} />
          ))}
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <EmailListToolbar
          selectedCount={0}
          isAllSelected={false}
          hasSelection={false}
          isRefreshing={isRefreshing}
          onSelectAll={noop}
          onClearSelection={noop}
          onMarkAsRead={noop}
          onMarkAsUnread={noop}
          onArchive={noop}
          onDelete={noop}
          onStar={noop}
          onRefresh={onRefresh}
        />
        <EmailListEmpty folder={folder} />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <EmailListToolbar
        selectedCount={selectedCount}
        isAllSelected={isAllSelected}
        hasSelection={hasSelection}
        isRefreshing={isRefreshing}
        onSelectAll={selectAllEmails}
        onClearSelection={clearSelection}
        onMarkAsRead={handleMarkAsRead}
        onMarkAsUnread={handleMarkAsUnread}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onStar={handleBulkStar}
        onRefresh={onRefresh}
      />

      {viewPreferences.groupByConversation ? (
        /* Threaded View */
        <ul
          className="flex-1 list-none overflow-auto"
          aria-label="Email conversations"
          id="email-list"
        >
          <EmailThreadGroup
            emails={emails}
            showDomainBadge={showDomainBadges}
            density={viewPreferences.density}
            onEmailClick={handleClick}
            onSelect={handleSelect}
            onStar={handleStar}
            onArchive={handleQuickArchive}
            onDelete={handleQuickDelete}
            onToggleRead={handleQuickToggleRead}
            isSelected={(id) => selectedEmails.has(id)}
            isFocused={(id) => focusedEmailId === id}
          />

          {/* Load more indicator */}
          {hasMore && (
            <li className="flex list-none items-center justify-center py-4">
              <RefreshCw
                className="h-5 w-5 animate-spin text-neutral-400"
                aria-label="Loading more emails"
              />
            </li>
          )}
        </ul>
      ) : (
        /* Flat View with Virtualization */
        <ul
          ref={parentRef}
          className="flex-1 list-none overflow-auto"
          aria-label="Email list"
          id="email-list"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
              const email = emails[virtualItem.index];
              if (!email) return null;
              return (
                <div
                  key={email.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <EmailListItemComponent
                    email={email}
                    isSelected={selectedEmails.has(email.id)}
                    isFocused={focusedEmailId === email.id}
                    showDomainBadge={showDomainBadges}
                    onSelect={handleSelect}
                    onClick={handleClick}
                    onStar={handleStar}
                    onArchive={handleQuickArchive}
                    onDelete={handleQuickDelete}
                    onToggleRead={handleQuickToggleRead}
                    density={viewPreferences.density}
                  />
                </div>
              );
            })}
          </div>

          {/* Load more indicator */}
          {hasMore && (
            <li className="flex list-none items-center justify-center py-4">
              <RefreshCw
                className="h-5 w-5 animate-spin text-neutral-400"
                aria-label="Loading more emails"
              />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default EmailList;
