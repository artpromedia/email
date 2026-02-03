"use client";

/**
 * Conversation Threading Hook
 * Manages email conversation threading with backend API integration
 */

import * as React from "react";
import type { EmailListItem } from "@/lib/mail";

// ============================================================================
// Types
// ============================================================================

export interface EmailThread {
  id: string;
  conversationId: string;
  subject: string;
  participants: ThreadParticipant[];
  messages: ThreadMessage[];
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  labels: string[];
  lastMessageAt: Date;
  firstMessageAt: Date;
  snippet: string;
  isStarred: boolean;
  isImportant: boolean;
  isDraft: boolean;
}

export interface ThreadParticipant {
  email: string;
  name?: string;
  avatarUrl?: string;
  isMe?: boolean;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  from: ThreadParticipant;
  to: ThreadParticipant[];
  cc?: ThreadParticipant[];
  bcc?: ThreadParticipant[];
  subject: string;
  body: string;
  bodyHtml?: string;
  snippet: string;
  sentAt: Date;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: ThreadAttachment[];
  inReplyTo?: string;
  references?: string[];
}

export interface ThreadAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
}

export interface ThreadingConfig {
  /** Whether to group by subject (fallback when no conversation ID) */
  groupBySubject?: boolean;
  /** Maximum number of messages to load initially */
  initialLoadCount?: number;
  /** Whether to auto-expand threads with unread messages */
  autoExpandUnread?: boolean;
  /** Sort order for threads */
  sortOrder?: "newest-first" | "oldest-first";
}

interface UseEmailThreadingOptions {
  /** Email folder to fetch threads from */
  folderId?: string;
  /** Domain filter */
  domainId?: string;
  /** Search query */
  searchQuery?: string;
  /** Threading configuration */
  config?: ThreadingConfig;
  /** API base URL */
  apiBaseUrl?: string;
}

interface UseEmailThreadingResult {
  /** List of email threads */
  threads: EmailThread[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh threads from API */
  refresh: () => Promise<void>;
  /** Load more threads */
  loadMore: () => Promise<void>;
  /** Whether there are more threads to load */
  hasMore: boolean;
  /** Get full thread details */
  getThread: (threadId: string) => Promise<EmailThread>;
  /** Mark entire thread as read */
  markThreadAsRead: (threadId: string) => Promise<void>;
  /** Mark entire thread as unread */
  markThreadAsUnread: (threadId: string) => Promise<void>;
  /** Archive thread */
  archiveThread: (threadId: string) => Promise<void>;
  /** Delete thread */
  deleteThread: (threadId: string) => Promise<void>;
  /** Star/unstar thread */
  toggleThreadStar: (threadId: string) => Promise<void>;
  /** Move thread to folder */
  moveThread: (threadId: string, folderId: string) => Promise<void>;
  /** Add label to thread */
  addLabel: (threadId: string, label: string) => Promise<void>;
  /** Remove label from thread */
  removeLabel: (threadId: string, label: string) => Promise<void>;
  /** Expanded thread IDs */
  expandedThreads: Set<string>;
  /** Toggle thread expansion */
  toggleExpanded: (threadId: string) => void;
  /** Expand a thread */
  expandThread: (threadId: string) => void;
  /** Collapse a thread */
  collapseThread: (threadId: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<ThreadingConfig> = {
  groupBySubject: true,
  initialLoadCount: 50,
  autoExpandUnread: true,
  sortOrder: "newest-first",
};

const DEFAULT_API_BASE = "/api/mail";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize subject for comparison (remove Re:, Fwd:, etc.)
 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .replace(/\[.*?\]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Group emails by conversation ID or subject
 */
export function groupEmailsIntoThreads(
  emails: EmailListItem[],
  config: ThreadingConfig = {}
): EmailThread[] {
  const { groupBySubject = true, sortOrder = "newest-first" } = config;

  const threadMap = new Map<string, EmailThread>();
  const subjectMap = new Map<string, string>(); // normalized subject -> threadId

  for (const email of emails) {
    let threadId = email.conversationId;

    // If no conversation ID and groupBySubject is enabled, try to match by subject
    if (!threadId && groupBySubject) {
      const normalizedSubject = normalizeSubject(email.subject);
      threadId = subjectMap.get(normalizedSubject);
    }

    // If still no thread ID, create a new thread
    if (!threadId) {
      threadId = email.id;
      if (groupBySubject) {
        const normalizedSubject = normalizeSubject(email.subject);
        subjectMap.set(normalizedSubject, threadId);
      }
    }

    const existingThread = threadMap.get(threadId);
    const messageDate = new Date(email.receivedAt ?? email.createdAt);

    const message: ThreadMessage = {
      id: email.id,
      threadId,
      from: {
        email: email.from.email,
        name: email.from.name,
      },
      to: email.to?.map((r) => ({ email: r.email, name: r.name })) ?? [],
      subject: email.subject,
      body: email.snippet,
      snippet: email.snippet,
      sentAt: messageDate,
      receivedAt: messageDate,
      isRead: email.isRead,
      isStarred: email.isStarred,
      hasAttachments: email.hasAttachments,
    };

    if (existingThread) {
      existingThread.messages.push(message);
      existingThread.messageCount++;
      if (!message.isRead) {
        existingThread.unreadCount++;
      }
      if (messageDate > existingThread.lastMessageAt) {
        existingThread.lastMessageAt = messageDate;
        existingThread.snippet = message.snippet;
      }
      if (messageDate < existingThread.firstMessageAt) {
        existingThread.firstMessageAt = messageDate;
      }
      if (message.hasAttachments) {
        existingThread.hasAttachments = true;
      }
      if (message.isStarred) {
        existingThread.isStarred = true;
      }
      // Add unique participants
      const existingEmails = new Set(existingThread.participants.map((p) => p.email));
      if (!existingEmails.has(message.from.email)) {
        existingThread.participants.push(message.from);
      }
    } else {
      const newThread: EmailThread = {
        id: threadId,
        conversationId: threadId,
        subject: email.subject,
        participants: [message.from],
        messages: [message],
        messageCount: 1,
        unreadCount: message.isRead ? 0 : 1,
        hasAttachments: message.hasAttachments,
        labels: email.labels ?? [],
        lastMessageAt: messageDate,
        firstMessageAt: messageDate,
        snippet: message.snippet,
        isStarred: message.isStarred,
        isImportant: false,
        isDraft: false,
      };
      threadMap.set(threadId, newThread);
    }
  }

  // Sort messages within each thread
  threadMap.forEach((thread) => {
    thread.messages.sort((a, b) => {
      const dateA = a.receivedAt.getTime();
      const dateB = b.receivedAt.getTime();
      return sortOrder === "newest-first" ? dateB - dateA : dateA - dateB;
    });
  });

  // Convert to array and sort threads
  const threads = Array.from(threadMap.values());
  threads.sort((a, b) => {
    const dateA = a.lastMessageAt.getTime();
    const dateB = b.lastMessageAt.getTime();
    return sortOrder === "newest-first" ? dateB - dateA : dateA - dateB;
  });

  return threads;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook for managing email conversation threading
 *
 * Features:
 * - Groups emails into conversation threads
 * - Supports backend API integration
 * - Handles thread expansion/collapse
 * - Provides actions for thread management
 *
 * @example
 * ```tsx
 * const {
 *   threads,
 *   isLoading,
 *   expandedThreads,
 *   toggleExpanded,
 *   markThreadAsRead,
 * } = useEmailThreading({ folderId: "inbox" });
 *
 * return threads.map((thread) => (
 *   <ThreadItem
 *     key={thread.id}
 *     thread={thread}
 *     isExpanded={expandedThreads.has(thread.id)}
 *     onToggle={() => toggleExpanded(thread.id)}
 *   />
 * ));
 * ```
 */
export function useEmailThreading(options: UseEmailThreadingOptions = {}): UseEmailThreadingResult {
  const {
    folderId = "inbox",
    domainId,
    searchQuery,
    config = {},
    apiBaseUrl = DEFAULT_API_BASE,
  } = options;

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const [threads, setThreads] = React.useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [expandedThreads, setExpandedThreads] = React.useState<Set<string>>(new Set());

  // Fetch threads from API
  const fetchThreads = React.useCallback(
    async (pageNum: number, append = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          folder: folderId,
          page: String(pageNum),
          limit: String(mergedConfig.initialLoadCount),
        });

        if (domainId) {
          params.set("domain", domainId);
        }

        if (searchQuery) {
          params.set("q", searchQuery);
        }

        const response = await fetch(`${apiBaseUrl}/threads?${params}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch threads: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          threads: EmailThread[];
          hasMore: boolean;
          total: number;
        };

        setThreads((prev) => (append ? [...prev, ...data.threads] : data.threads));
        setHasMore(data.hasMore);

        // Auto-expand threads with unread messages
        if (mergedConfig.autoExpandUnread) {
          const unreadThreadIds = data.threads.filter((t) => t.unreadCount > 0).map((t) => t.id);
          setExpandedThreads((prev) => new Set([...prev, ...unreadThreadIds]));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      apiBaseUrl,
      domainId,
      folderId,
      mergedConfig.autoExpandUnread,
      mergedConfig.initialLoadCount,
      searchQuery,
    ]
  );

  // Initial fetch
  React.useEffect(() => {
    void fetchThreads(1);
  }, [fetchThreads]);

  // Refresh threads
  const refresh = React.useCallback(async () => {
    setPage(1);
    await fetchThreads(1);
  }, [fetchThreads]);

  // Load more threads
  const loadMore = React.useCallback(async () => {
    if (!hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchThreads(nextPage, true);
  }, [fetchThreads, hasMore, isLoading, page]);

  // Get full thread details
  const getThread = React.useCallback(
    async (threadId: string): Promise<EmailThread> => {
      const response = await fetch(`${apiBaseUrl}/threads/${threadId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch thread: ${response.statusText}`);
      }
      return response.json() as Promise<EmailThread>;
    },
    [apiBaseUrl]
  );

  // Thread actions
  const threadAction = React.useCallback(
    async (
      threadId: string,
      action: string,
      method: "POST" | "PUT" | "DELETE" = "POST",
      body?: object
    ) => {
      const response = await fetch(`${apiBaseUrl}/threads/${threadId}/${action}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} thread: ${response.statusText}`);
      }
    },
    [apiBaseUrl]
  );

  const markThreadAsRead = React.useCallback(
    async (threadId: string) => {
      await threadAction(threadId, "read");
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                unreadCount: 0,
                messages: t.messages.map((m) => ({ ...m, isRead: true })),
              }
            : t
        )
      );
    },
    [threadAction]
  );

  const markThreadAsUnread = React.useCallback(
    async (threadId: string) => {
      await threadAction(threadId, "unread");
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                unreadCount: 1,
                messages: t.messages.map((m, i) => (i === 0 ? { ...m, isRead: false } : m)),
              }
            : t
        )
      );
    },
    [threadAction]
  );

  const archiveThread = React.useCallback(
    async (threadId: string) => {
      await threadAction(threadId, "archive");
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    },
    [threadAction]
  );

  const deleteThread = React.useCallback(
    async (threadId: string) => {
      await threadAction(threadId, "delete", "DELETE");
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    },
    [threadAction]
  );

  const toggleThreadStar = React.useCallback(
    async (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId);
      if (!thread) return;

      await threadAction(threadId, thread.isStarred ? "unstar" : "star");
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, isStarred: !t.isStarred } : t))
      );
    },
    [threadAction, threads]
  );

  const moveThread = React.useCallback(
    async (threadId: string, targetFolderId: string) => {
      await threadAction(threadId, "move", "POST", { folderId: targetFolderId });
      // Remove from current view if we're not in the target folder
      if (targetFolderId !== folderId) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      }
    },
    [threadAction, folderId]
  );

  const addLabel = React.useCallback(
    async (threadId: string, label: string) => {
      await threadAction(threadId, "labels", "POST", { label, action: "add" });
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, labels: [...t.labels, label] } : t))
      );
    },
    [threadAction]
  );

  const removeLabel = React.useCallback(
    async (threadId: string, label: string) => {
      await threadAction(threadId, "labels", "POST", { label, action: "remove" });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, labels: t.labels.filter((l) => l !== label) } : t
        )
      );
    },
    [threadAction]
  );

  // Expansion management
  const toggleExpanded = React.useCallback((threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }, []);

  const expandThread = React.useCallback((threadId: string) => {
    setExpandedThreads((prev) => new Set([...prev, threadId]));
  }, []);

  const collapseThread = React.useCallback((threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      next.delete(threadId);
      return next;
    });
  }, []);

  return {
    threads,
    isLoading,
    error,
    refresh,
    loadMore,
    hasMore,
    getThread,
    markThreadAsRead,
    markThreadAsUnread,
    archiveThread,
    deleteThread,
    toggleThreadStar,
    moveThread,
    addLabel,
    removeLabel,
    expandedThreads,
    toggleExpanded,
    expandThread,
    collapseThread,
  };
}

// ============================================================================
// Context for Thread State
// ============================================================================

type ThreadingContextValue = UseEmailThreadingResult;

const ThreadingContext = React.createContext<ThreadingContextValue | null>(null);

export function ThreadingProvider({
  children,
  ...options
}: UseEmailThreadingOptions & { children: React.ReactNode }) {
  const threading = useEmailThreading(options);

  return <ThreadingContext.Provider value={threading}>{children}</ThreadingContext.Provider>;
}

export function useThreadingContext() {
  const context = React.useContext(ThreadingContext);
  if (!context) {
    throw new Error("useThreadingContext must be used within a ThreadingProvider");
  }
  return context;
}

export default useEmailThreading;
