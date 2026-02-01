"use client";

/**
 * Email Thread Group Component
 * Groups emails by conversationId and provides expand/collapse functionality
 */

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@email/ui";

import { EmailListItemComponent } from "./EmailListItem";
import type { EmailListItem } from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

interface EmailThread {
  conversationId: string;
  emails: EmailListItem[];
  rootEmail: EmailListItem;
  replyCount: number;
  latestDate: Date;
  hasUnread: boolean;
}

interface EmailThreadGroupProps {
  emails: EmailListItem[];
  showDomainBadge?: boolean;
  density?: "comfortable" | "compact" | "cozy";
  onEmailClick: (emailId: string) => void;
  onSelect: (emailId: string, event: React.MouseEvent) => void;
  onStar: (emailId: string) => void;
  onArchive?: (emailId: string) => void;
  onDelete?: (emailId: string) => void;
  onToggleRead?: (emailId: string) => void;
  isSelected: (emailId: string) => boolean;
  isFocused: (emailId: string) => boolean;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Group emails by conversationId into threads
 */
function groupEmailsIntoThreads(emails: EmailListItem[]): Map<string, EmailThread> {
  const threads = new Map<string, EmailThread>();
  const standaloneEmails = new Map<string, EmailThread>();

  emails.forEach((email) => {
    const conversationId = email.conversationId || email.id;

    // If this email is part of a conversation
    if (email.conversationId) {
      const existingThread = threads.get(conversationId);

      if (existingThread) {
        existingThread.emails.push(email);
        // Update latest date
        const emailDate = new Date(email.receivedAt ?? email.createdAt);
        if (emailDate > existingThread.latestDate) {
          existingThread.latestDate = emailDate;
        }
        // Update unread status
        if (!email.isRead) {
          existingThread.hasUnread = true;
        }
        // Update reply count
        existingThread.replyCount = existingThread.emails.length - 1;
      } else {
        // Create new thread
        threads.set(conversationId, {
          conversationId,
          emails: [email],
          rootEmail: email,
          replyCount: 0,
          latestDate: new Date(email.receivedAt ?? email.createdAt),
          hasUnread: !email.isRead,
        });
      }
    } else {
      // Standalone email (no conversation)
      standaloneEmails.set(email.id, {
        conversationId: email.id,
        emails: [email],
        rootEmail: email,
        replyCount: 0,
        latestDate: new Date(email.receivedAt ?? email.createdAt),
        hasUnread: !email.isRead,
      });
    }
  });

  // Sort emails within each thread by date (oldest first)
  threads.forEach((thread) => {
    thread.emails.sort((a, b) => {
      const dateA = new Date(a.receivedAt ?? a.createdAt).getTime();
      const dateB = new Date(b.receivedAt ?? b.createdAt).getTime();
      return dateA - dateB;
    });
    // Root email is the first one
    const firstEmail = thread.emails.at(0);
    if (firstEmail) {
      thread.rootEmail = firstEmail;
    }
  });

  // Combine threads and standalone emails
  return new Map([...threads, ...standaloneEmails]);
}

/**
 * Sort threads by latest date (descending)
 */
function sortThreadsByDate(threads: EmailThread[]): EmailThread[] {
  return threads.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
}

// ============================================================
// THREAD EXPAND INDICATOR COMPONENT
// ============================================================

interface ThreadExpandIndicatorProps {
  isExpanded: boolean;
  replyCount: number;
  hasUnread: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function ThreadExpandIndicator({
  isExpanded,
  replyCount,
  hasUnread,
  onClick,
}: ThreadExpandIndicatorProps) {
  if (replyCount === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        hasUnread ? "text-blue-600 dark:text-blue-400" : "text-neutral-600 dark:text-neutral-400"
      )}
      type="button"
      aria-label={isExpanded ? "Collapse thread" : "Expand thread"}
    >
      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      <span>
        {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </span>
    </button>
  );
}

// ============================================================
// SINGLE THREAD COMPONENT
// ============================================================

interface SingleThreadProps {
  thread: EmailThread;
  showDomainBadge?: boolean;
  density?: "comfortable" | "compact" | "cozy";
  onEmailClick: (emailId: string) => void;
  onSelect: (emailId: string, event: React.MouseEvent) => void;
  onStar: (emailId: string) => void;
  onArchive?: (emailId: string) => void;
  onDelete?: (emailId: string) => void;
  onToggleRead?: (emailId: string) => void;
  isSelected: (emailId: string) => boolean;
  isFocused: (emailId: string) => boolean;
}

function SingleThread({
  thread,
  showDomainBadge,
  density,
  onEmailClick,
  onSelect,
  onStar,
  onArchive,
  onDelete,
  onToggleRead,
  isSelected,
  isFocused,
}: SingleThreadProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const { rootEmail, emails, replyCount, hasUnread } = thread;

  // If no replies, just show the single email
  if (replyCount === 0) {
    return (
      <EmailListItemComponent
        email={rootEmail}
        isSelected={isSelected(rootEmail.id)}
        isFocused={isFocused(rootEmail.id)}
        showDomainBadge={showDomainBadge}
        onSelect={onSelect}
        onClick={onEmailClick}
        onStar={onStar}
        onArchive={onArchive}
        onDelete={onDelete}
        onToggleRead={onToggleRead}
        density={density}
      />
    );
  }

  // Show root email with thread indicator
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700">
      {/* Root Email */}
      <div className="relative">
        <EmailListItemComponent
          email={rootEmail}
          isSelected={isSelected(rootEmail.id)}
          isFocused={isFocused(rootEmail.id)}
          showDomainBadge={showDomainBadge}
          onSelect={onSelect}
          onClick={onEmailClick}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onToggleRead={onToggleRead}
          density={density}
        />

        {/* Thread Expand Indicator */}
        <div className="absolute bottom-2 right-4">
          <ThreadExpandIndicator
            isExpanded={isExpanded}
            replyCount={replyCount}
            hasUnread={hasUnread}
            onClick={handleExpandToggle}
          />
        </div>
      </div>

      {/* Expanded Replies */}
      {isExpanded && (
        <div className="bg-neutral-50 dark:bg-neutral-900/50">
          {emails.slice(1).map((email, index) => (
            <div
              key={email.id}
              className="border-t border-neutral-200 dark:border-neutral-700"
              style={{
                paddingLeft: `${Math.min(index + 1, 3) * 16}px`,
              }}
            >
              <EmailListItemComponent
                email={email}
                isSelected={isSelected(email.id)}
                isFocused={isFocused(email.id)}
                showDomainBadge={showDomainBadge}
                onSelect={onSelect}
                onClick={onEmailClick}
                onStar={onStar}
                onArchive={onArchive}
                onDelete={onDelete}
                onToggleRead={onToggleRead}
                density={density}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN EMAIL THREAD GROUP COMPONENT
// ============================================================

export function EmailThreadGroup({
  emails,
  showDomainBadge,
  density,
  onEmailClick,
  onSelect,
  onStar,
  onArchive,
  onDelete,
  onToggleRead,
  isSelected,
  isFocused,
}: EmailThreadGroupProps) {
  // Group emails into threads
  const threads = useMemo(() => {
    const threadMap = groupEmailsIntoThreads(emails);
    const threadArray = Array.from(threadMap.values());
    return sortThreadsByDate(threadArray);
  }, [emails]);

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
      {threads.map((thread) => (
        <SingleThread
          key={thread.conversationId}
          thread={thread}
          showDomainBadge={showDomainBadge}
          density={density}
          onEmailClick={onEmailClick}
          onSelect={onSelect}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onToggleRead={onToggleRead}
          isSelected={isSelected}
          isFocused={isFocused}
        />
      ))}
    </div>
  );
}
          key={thread.conversationId}
          thread={thread}
          showDomainBadge={showDomainBadge}
          density={density}
          onEmailClick={onEmailClick}
          onSelect={onSelect}
          onStar={onStar}
          isSelected={isSelected}
          isFocused={isFocused}
        />
      ))}
    </div>
  );
}
