"use client";

/**
 * Smart Reply Suggestions Component
 * Displays AI-generated reply suggestions as interactive chips
 */

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Check, Edit2, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

export interface ReplySuggestion {
  id: string;
  content: string;
  tone: "professional" | "friendly" | "concise" | "formal" | "casual";
  confidenceScore: number;
  isQuickReply: boolean;
  previewText: string;
  wordCount: number;
}

interface SmartReplyResponse {
  emailId: string;
  suggestions: ReplySuggestion[];
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
}

interface SmartReplySuggestionsProps {
  emailId: string;
  subject: string;
  body: string;
  fromAddress: string;
  fromName: string;
  userId: string;
  orgId: string;
  userName: string;
  userEmail: string;
  userSignature?: string;
  onSelect: (content: string, tone: string) => void;
  onEdit: (content: string, tone: string) => void;
  className?: string;
  quickReplyMode?: boolean; // For mobile
}

// ============================================================
// TONE CONFIG
// ============================================================

const toneConfig = {
  professional: {
    label: "Professional",
    icon: "💼",
    color:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  },
  friendly: {
    label: "Friendly",
    icon: "😊",
    color:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  },
  concise: {
    label: "Concise",
    icon: "⚡",
    color:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  },
  formal: {
    label: "Formal",
    icon: "📋",
    color:
      "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-700",
  },
  casual: {
    label: "Casual",
    icon: "👋",
    color:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  },
};

// ============================================================
// COMPONENT
// ============================================================

export function SmartReplySuggestions({
  emailId,
  subject,
  body,
  fromAddress,
  fromName,
  userId,
  orgId,
  userName,
  userEmail,
  userSignature,
  onSelect,
  onEdit,
  className,
  quickReplyMode = false,
}: Readonly<SmartReplySuggestionsProps>) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          subject,
          body,
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: [userEmail],
          user_id: userId,
          org_id: orgId,
          user_name: userName,
          user_email: userEmail,
          user_signature: userSignature,
          num_suggestions: 3,
          quick_reply: quickReplyMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate suggestions");
      }

      const data = (await response.json()) as SmartReplyResponse;
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setIsLoading(false);
    }
  }, [
    emailId,
    subject,
    body,
    fromAddress,
    fromName,
    userEmail,
    userId,
    orgId,
    userName,
    userSignature,
    quickReplyMode,
  ]);

  // Auto-fetch on mount
  useEffect(() => {
    if (emailId && body) {
      void fetchSuggestions();
    }
  }, [emailId, body, fetchSuggestions]);

  // Handle suggestion selection
  const handleSelect = (suggestion: ReplySuggestion) => {
    setSelectedId(suggestion.id);
    onSelect(suggestion.content, suggestion.tone);
  };

  // Handle edit click
  const handleEdit = (suggestion: ReplySuggestion) => {
    onEdit(suggestion.content, suggestion.tone);
  };

  // Send feedback
  const sendFeedback = async (suggestionId: string, feedback: "positive" | "negative") => {
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "smart_reply",
          suggestion_id: suggestionId,
          feedback,
          user_id: userId,
        }),
      });
    } catch {
      // Ignore feedback errors
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 py-3", className)}>
        <Sparkles className="h-4 w-4 animate-pulse text-violet-500" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Generating smart replies...
        </span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={`skeleton-${i}`}
              className="h-8 w-24 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center gap-2 py-3", className)}>
        <span className="text-sm text-red-500">{error}</span>
        <button
          onClick={fetchSuggestions}
          className="text-sm text-violet-600 hover:underline dark:text-violet-400"
        >
          Try again
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Smart Replies
          </span>
        </div>
        <button
          onClick={fetchSuggestions}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="Refresh suggestions"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const config = toneConfig[suggestion.tone];
          const isSelected = selectedId === suggestion.id;
          const isExpanded = expandedId === suggestion.id;

          return (
            <div key={suggestion.id} className="group relative">
              {/* Chip */}
              <button
                onClick={() => {
                  if (isExpanded) {
                    handleSelect(suggestion);
                  } else {
                    setExpandedId(suggestion.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                  config.color,
                  isSelected && "ring-2 ring-violet-500 ring-offset-1",
                  "hover:shadow-sm"
                )}
              >
                <span>{config.icon}</span>
                <span className="max-w-[200px] truncate">
                  {isExpanded ? suggestion.content.slice(0, 100) : suggestion.previewText}
                </span>
                {suggestion.isQuickReply && (
                  <span className="rounded bg-black/10 px-1 text-[10px] font-medium dark:bg-white/10">
                    Quick
                  </span>
                )}
              </button>

              {/* Expanded Actions */}
              {isExpanded && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                  {/* Full Content Preview */}
                  <p className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">
                    {suggestion.content}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <button
                        onClick={() => sendFeedback(suggestion.id, "positive")}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-green-600 dark:hover:bg-neutral-700"
                        title="Helpful"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => sendFeedback(suggestion.id, "negative")}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-700"
                        title="Not helpful"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(suggestion)}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleSelect(suggestion)}
                        className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-700"
                      >
                        <Check className="h-3 w-3" />
                        Use This
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapse Button */}
      {expandedId && (
        <button
          onClick={() => setExpandedId(null)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Collapse
        </button>
      )}
    </div>
  );
}

// ============================================================
// MOBILE QUICK REPLY VERSION
// ============================================================

export function QuickReplySuggestions({
  suggestions,
  onSelect,
  isLoading,
}: Readonly<{
  suggestions: ReplySuggestion[];
  onSelect: (content: string) => void;
  isLoading: boolean;
}>) {
  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto p-2">
        {[0, 1, 2].map((i) => (
          <div
            key={`quick-skeleton-${i}`}
            className="h-10 w-28 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700"
          />
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="scrollbar-hide flex gap-2 overflow-x-auto p-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          onClick={() => onSelect(suggestion.content)}
          className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 active:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {suggestion.previewText}
        </button>
      ))}
    </div>
  );
}
