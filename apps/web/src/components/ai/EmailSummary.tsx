"use client";

/**
 * Email Summary Component
 * TL;DR, thread summaries, and action items
 */

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  ListTodo,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

interface ActionItem {
  id: string;
  description: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  assignee?: string;
  completed?: boolean;
}

interface EmailSummaryData {
  emailId: string;
  summary: string;
  tldr: string;
  actionItems: ActionItem[];
  keyPoints: string[];
  sentiment: string;
  needsTldr: boolean;
  cached: boolean;
  latencyMs: number;
}

interface ThreadSummaryData {
  threadId: string;
  summary: string;
  participants: string[];
  messageCount: number;
  keyDecisions: string[];
  openQuestions: string[];
  actionItems: ActionItem[];
  timeline: { date: string; description: string; actor: string }[];
  currentStatus: string;
}

// ============================================================
// EMAIL SUMMARY COMPONENT
// ============================================================

interface EmailSummaryProps {
  emailId: string;
  subject: string;
  body: string;
  fromAddress: string;
  fromName: string;
  date: string;
  userId: string;
  orgId: string;
  autoExpand?: boolean;
  showTldr?: boolean;
  className?: string;
}

export function EmailSummary({
  emailId,
  subject,
  body,
  fromAddress,
  fromName,
  date,
  userId,
  orgId,
  autoExpand = false,
  showTldr = true,
  className,
}: Readonly<EmailSummaryProps>) {
  const [data, setData] = useState<EmailSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(autoExpand);

  // Check if TL;DR should be shown
  const shouldShowTldr = showTldr && body.length > 500;

  const fetchSummary = useCallback(async () => {
    if (!shouldShowTldr && !isExpanded) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/summarize/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          subject,
          body,
          from_address: fromAddress,
          from_name: fromName,
          date,
          user_id: userId,
          org_id: orgId,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate summary");

      const result = (await response.json()) as EmailSummaryData;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setIsLoading(false);
    }
  }, [
    shouldShowTldr,
    isExpanded,
    emailId,
    subject,
    body,
    fromAddress,
    fromName,
    date,
    userId,
    orgId,
  ]);

  useEffect(() => {
    if (shouldShowTldr || isExpanded) {
      void fetchSummary();
    }
  }, [emailId, isExpanded, fetchSummary, shouldShowTldr]);

  if (!shouldShowTldr && !isExpanded) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20",
        "dark:border-neutral-700",
        className
      )}
    >
      {/* TL;DR Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {isLoading ? "Summarizing..." : "AI Summary"}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-neutral-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        )}
      </button>

      {/* TL;DR Line (always visible if data available) */}
      {data?.tldr && !isExpanded && (
        <div className="border-t px-4 py-2 dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-semibold text-violet-600 dark:text-violet-400">TL;DR:</span>{" "}
            {data.tldr}
          </p>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 border-t px-4 py-3 dark:border-neutral-700">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Generating summary...
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {error}
              <button onClick={fetchSummary} className="text-violet-600 hover:underline">
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* Full Summary */}
              <div>
                <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                  <FileText className="h-3.5 w-3.5" />
                  Summary
                </h4>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{data.summary}</p>
              </div>

              {/* Key Points */}
              {data.keyPoints.length > 0 && (
                <div>
                  <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Key Points
                  </h4>
                  <ul className="space-y-1">
                    {data.keyPoints.map((point, i) => (
                      <li
                        key={`point-${i}`}
                        className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {data.actionItems.length > 0 && (
                <ActionItemsList items={data.actionItems} title="Action Items" />
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ============================================================
// THREAD SUMMARY COMPONENT
// ============================================================

interface ThreadSummaryProps {
  threadId: string;
  subject: string;
  messages: {
    id: string;
    fromAddress: string;
    fromName: string;
    body: string;
    date: string;
    isFromUser: boolean;
  }[];
  userId: string;
  orgId: string;
  className?: string;
}

export function ThreadSummary({
  threadId,
  subject,
  messages,
  userId,
  orgId,
  className,
}: Readonly<ThreadSummaryProps>) {
  const [data, setData] = useState<ThreadSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "timeline" | "actions">("summary");

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/summarize/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          subject,
          messages: messages.map((m) => ({
            id: m.id,
            from_address: m.fromAddress,
            from_name: m.fromName,
            body: m.body,
            date: m.date,
            is_from_user: m.isFromUser,
          })),
          user_id: userId,
          org_id: orgId,
        }),
      });

      if (!response.ok) throw new Error("Failed to summarize thread");

      const result = (await response.json()) as ThreadSummaryData;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thread summary failed");
    } finally {
      setIsLoading(false);
    }
  }, [threadId, subject, messages, userId, orgId]);

  useEffect(() => {
    if (messages.length > 2) {
      void fetchSummary();
    }
  }, [threadId, fetchSummary, messages.length]);

  if (messages.length <= 2) {
    return null; // Don't show for short threads
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="font-medium text-neutral-800 dark:text-neutral-200">Thread Summary</span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-700">
            {messages.length} messages
          </span>
        </div>
        {data?.currentStatus && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              data.currentStatus === "resolved"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : data.currentStatus === "pending"
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            )}
          >
            {data.currentStatus}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-neutral-700">
        {(["summary", "timeline", "actions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium capitalize",
              activeTab === tab
                ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-neutral-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analyzing thread...
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">
            {error}{" "}
            <button onClick={fetchSummary} className="text-violet-600 hover:underline">
              Retry
            </button>
          </div>
        ) : data ? (
          <>
            {activeTab === "summary" && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{data.summary}</p>

                {data.keyDecisions.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-green-600 dark:text-green-400">
                      ✓ Key Decisions
                    </h4>
                    <ul className="space-y-1">
                      {data.keyDecisions.map((decision, i) => (
                        <li key={`decision-${i}`} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                          <span className="text-neutral-600 dark:text-neutral-400">{decision}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.openQuestions.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">
                      ? Open Questions
                    </h4>
                    <ul className="space-y-1">
                      {data.openQuestions.map((question, i) => (
                        <li key={`question-${i}`} className="flex items-start gap-2 text-sm">
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                          <span className="text-neutral-600 dark:text-neutral-400">{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.participants.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span>Participants:</span>
                    <span>{data.participants.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === "timeline" && (
              <div className="space-y-3">
                {data.timeline.map((event, i) => (
                  <div key={`event-${event.date}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-violet-500" />
                      {i < data.timeline.length - 1 && (
                        <div className="h-full w-px bg-neutral-200 dark:bg-neutral-700" />
                      )}
                    </div>
                    <div className="pb-3">
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Clock className="h-3 w-3" />
                        {event.date}
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {event.actor}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {event.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "actions" && (
              <ActionItemsList items={data.actionItems} title="Thread Action Items" />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// ACTION ITEMS LIST COMPONENT
// ============================================================

interface ActionItemsListProps {
  items: ActionItem[];
  title?: string;
  onToggle?: (id: string, completed: boolean) => void;
  className?: string;
}

export function ActionItemsList({
  items,
  title,
  onToggle,
  className,
}: Readonly<ActionItemsListProps>) {
  if (items.length === 0) {
    return null;
  }

  const priorityColors = {
    high: "text-red-500",
    medium: "text-yellow-500",
    low: "text-neutral-400",
  };

  return (
    <div className={className}>
      {title && (
        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
          <ListTodo className="h-3.5 w-3.5" />
          {title}
        </h4>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-start gap-2 rounded-md border p-2 text-sm",
              "dark:border-neutral-700",
              item.completed && "opacity-60"
            )}
          >
            <button
              onClick={() => onToggle?.(item.id, !item.completed)}
              className="mt-0.5 shrink-0"
            >
              {item.completed ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Circle className={cn("h-4 w-4", priorityColors[item.priority])} />
              )}
            </button>
            <div className="flex-1">
              <span
                className={cn(
                  "text-neutral-700 dark:text-neutral-300",
                  item.completed && "line-through"
                )}
              >
                {item.description}
              </span>
              <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                {item.dueDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.dueDate}
                  </span>
                )}
                {item.assignee && <span>@{item.assignee}</span>}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 capitalize",
                    item.priority === "high"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : item.priority === "medium"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  )}
                >
                  {item.priority}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// TL;DR BADGE (Inline)
// ============================================================

export function TldrBadge({ tldr, className }: Readonly<{ tldr: string; className?: string }>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-violet-50 px-3 py-1.5 dark:bg-violet-950/30",
        className
      )}
    >
      <span className="shrink-0 text-xs font-bold text-violet-600 dark:text-violet-400">TL;DR</span>
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{tldr}</span>
    </div>
  );
}
