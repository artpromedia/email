"use client";

/**
 * Email List Item Component
 * Displays individual email with domain badge support for unified view
 */

import { forwardRef, memo } from "react";
import { format, isToday, isYesterday, isThisYear } from "date-fns";
import { Star, Paperclip, Reply, Forward, AlertCircle } from "lucide-react";
import type { EmailPriority } from "@email/types";
import { cn } from "@email/ui";

import type { EmailListItem } from "@/lib/mail";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatEmailDate(date: Date): string {
  if (isToday(date)) {
    return format(date, "h:mm a");
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (isThisYear(date)) {
    return format(date, "MMM d");
  }
  return format(date, "MM/dd/yy");
}

function getPriorityIcon(priority: EmailPriority) {
  switch (priority) {
    case "urgent":
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    case "high":
      return <AlertCircle className="h-3 w-3 text-orange-500" />;
    default:
      return null;
  }
}

// ============================================================
// DOMAIN BADGE COMPONENT
// ============================================================

interface DomainBadgeInlineProps {
  domain: string;
  color: string;
}

function DomainBadgeInline({ domain, color }: DomainBadgeInlineProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `${color}15`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {domain}
    </span>
  );
}

// ============================================================
// AVATAR COMPONENT
// ============================================================

interface SenderAvatarProps {
  name?: string | undefined;
  email: string;
  size?: "sm" | "md";
}

function SenderAvatar({ name, email, size = "md" }: SenderAvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .filter((n) => n.length > 0)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) ||
      email[0]?.toUpperCase() ||
      "?"
    : email[0]?.toUpperCase() || "?";

  // Generate consistent color from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white",
        size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
      )}
      style={{ backgroundColor: `hsl(${hue}, 65%, 55%)` }}
    >
      {initials}
    </div>
  );
}

// ============================================================
// EMAIL LIST ITEM COMPONENT
// ============================================================

export interface EmailListItemProps {
  email: EmailListItem;
  isSelected: boolean;
  isFocused: boolean;
  showDomainBadge?: boolean;
  onSelect: (emailId: string, event: React.MouseEvent) => void;
  onClick: (emailId: string) => void;
  onStar: (emailId: string) => void;
  density?: "comfortable" | "compact" | "cozy";
  className?: string;
}

export const EmailListItemComponent = memo(
  forwardRef<HTMLDivElement, EmailListItemProps>(
    (
      {
        email,
        isSelected,
        isFocused,
        showDomainBadge = false,
        onSelect,
        onClick,
        onStar,
        density = "comfortable",
        className,
        ...props
      },
      ref
    ) => {
      const hasAttachments = email.attachments && email.attachments.length > 0;
      const senderName = email.from.name ?? email.from.address;
      const receivedDate = new Date(email.receivedAt ?? email.createdAt);

      return (
        <div
          ref={ref}
          role="row"
          aria-selected={isSelected}
          tabIndex={0}
          onClick={() => onClick(email.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick(email.id);
            }
          }}
          className={cn(
            "group relative flex cursor-pointer border-b border-neutral-100 dark:border-neutral-800",
            "transition-colors duration-100",
            "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
            isSelected && "bg-blue-50 dark:bg-blue-950/30",
            isFocused && "ring-2 ring-inset ring-blue-500",
            !email.isRead && "bg-white dark:bg-neutral-900",
            email.isRead && "bg-neutral-50/50 dark:bg-neutral-900/50",
            density === "compact" && "px-3 py-1.5",
            density === "comfortable" && "px-4 py-3",
            density === "cozy" && "px-4 py-4",
            className
          )}
          {...props}
        >
          {/* Selection Checkbox */}
          <div className="flex items-center pr-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(email.id, e as unknown as React.MouseEvent);
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "h-4 w-4 rounded border-neutral-300 text-blue-600",
                "focus:ring-blue-500 focus:ring-offset-0",
                "dark:border-neutral-600 dark:bg-neutral-800"
              )}
            />
          </div>

          {/* Star Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStar(email.id);
            }}
            className={cn(
              "flex items-center pr-3 transition-colors",
              email.isStarred
                ? "text-yellow-400"
                : "text-neutral-300 hover:text-yellow-400 dark:text-neutral-600"
            )}
          >
            <Star className="h-4 w-4" fill={email.isStarred ? "currentColor" : "none"} />
          </button>

          {/* Avatar */}
          <div className="flex items-center pr-3">
            <SenderAvatar
              name={email.from.name}
              email={email.from.address}
              size={density === "compact" ? "sm" : "md"}
            />
          </div>

          {/* Email Content */}
          <div className="min-w-0 flex-1">
            {/* Top Row: Sender, Domain Badge, Date */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "truncate",
                  !email.isRead
                    ? "font-semibold text-neutral-900 dark:text-white"
                    : "font-medium text-neutral-700 dark:text-neutral-300"
                )}
              >
                {senderName}
              </span>

              {/* Domain Badge (Unified View) */}
              {showDomainBadge && (
                <DomainBadgeInline domain={email.domainName} color={email.domainColor} />
              )}

              {/* Thread Count */}
              {email.threadCount && email.threadCount > 1 && (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                  {email.threadCount}
                </span>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Priority Icon */}
              {getPriorityIcon(email.priority)}

              {/* Reply/Forward Indicators */}
              {email.hasReplied && <Reply className="h-3 w-3 text-neutral-400" />}
              {email.hasForwarded && <Forward className="h-3 w-3 text-neutral-400" />}

              {/* Attachment Icon */}
              {hasAttachments && <Paperclip className="h-3 w-3 text-neutral-400" />}

              {/* Date */}
              <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                {formatEmailDate(receivedDate)}
              </span>
            </div>

            {/* Subject */}
            <div
              className={cn(
                "mt-0.5 truncate",
                !email.isRead
                  ? "text-neutral-900 dark:text-white"
                  : "text-neutral-600 dark:text-neutral-400"
              )}
            >
              {email.subject || "(No Subject)"}
            </div>

            {/* Snippet */}
            {density !== "compact" && (
              <div className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                {email.snippet}
              </div>
            )}

            {/* Labels */}
            {email.labels && email.labels.length > 0 && (
              <div className="mt-1.5 flex gap-1">
                {email.labels.slice(0, 3).map((label: string) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {label}
                  </span>
                ))}
                {email.labels.length > 3 && (
                  <span className="text-xs text-neutral-500">+{email.labels.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
  )
);

EmailListItemComponent.displayName = "EmailListItem";

// ============================================================
// SKELETON COMPONENT
// ============================================================

export function EmailListItemSkeleton({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact" | "cozy";
}) {
  return (
    <div
      className={cn(
        "flex animate-pulse border-b border-neutral-100 dark:border-neutral-800",
        density === "compact" && "px-3 py-1.5",
        density === "comfortable" && "px-4 py-3",
        density === "cozy" && "px-4 py-4"
      )}
    >
      <div className="flex items-center pr-3">
        <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="flex items-center pr-3">
        <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="flex items-center pr-3">
        <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="flex-1" />
          <div className="h-4 w-16 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
        <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700" />
        {density !== "compact" && (
          <div className="h-4 w-full rounded bg-neutral-200 dark:bg-neutral-700" />
        )}
      </div>
    </div>
  );
}

export default EmailListItemComponent;
