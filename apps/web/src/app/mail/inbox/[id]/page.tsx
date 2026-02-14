"use client";

/**
 * Email Detail Page
 * Full email view when preview pane is disabled or navigating directly to an email
 * URL: /mail/inbox/{emailId}
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Loader2,
  Paperclip,
  Download,
  Tag,
  Printer,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@email/ui";
import { Badge } from "@email/ui/components/badge";
import { Button } from "@email/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@email/ui/components/dropdown-menu";

import {
  useEmail,
  useMarkAsRead,
  useStarEmails,
  useUnstarEmails,
  useDeleteEmails,
} from "@/lib/mail";

// ============================================================
// EMAIL DETAIL CONTENT
// ============================================================

function EmailDetailContent() {
  const router = useRouter();
  const params = useParams();
  const emailId = params["id"] as string;

  // Fetch full email
  const { data: email, isLoading, isError, error } = useEmail(emailId);

  // Mutations
  const markAsRead = useMarkAsRead();
  const starEmails = useStarEmails();
  const unstarEmails = useUnstarEmails();
  const deleteEmails = useDeleteEmails();

  const [showFullHeaders, setShowFullHeaders] = useState(false);
  const markedReadRef = useRef(false);

  // Mark as read on mount
  useEffect(() => {
    if (email && !email.isRead && !markedReadRef.current) {
      markedReadRef.current = true;
      markAsRead.mutate([emailId]);
    }
  }, [email, emailId, markAsRead]);

  // Actions
  const handleBack = useCallback(() => {
    router.push("/mail/inbox");
  }, [router]);

  const handleReply = useCallback(() => {
    if (!email) return;
    router.push(
      `/mail/compose?mode=reply&to=${encodeURIComponent(email.from.address)}&subject=${encodeURIComponent(`Re: ${email.subject}`)}`
    );
  }, [router, email]);

  const handleReplyAll = useCallback(() => {
    if (!email) return;
    const allRecipients = [
      email.from.address,
      ...email.to.map((t) => t.address),
      ...(email.cc?.map((c) => c.address) ?? []),
    ]
      .filter(Boolean)
      .join(",");
    router.push(
      `/mail/compose?mode=reply-all&to=${encodeURIComponent(allRecipients)}&subject=${encodeURIComponent(`Re: ${email.subject}`)}`
    );
  }, [router, email]);

  const handleForward = useCallback(() => {
    if (!email) return;
    router.push(
      `/mail/compose?mode=forward&subject=${encodeURIComponent(`Fwd: ${email.subject}`)}`
    );
  }, [router, email]);

  const handleToggleStar = useCallback(() => {
    if (email?.isStarred) {
      unstarEmails.mutate([emailId]);
    } else {
      starEmails.mutate([emailId]);
    }
  }, [email, emailId, starEmails, unstarEmails]);

  const handleArchive = useCallback(() => {
    deleteEmails.mutate([emailId]);
    router.push("/mail/inbox");
  }, [emailId, deleteEmails, router]);

  const handleDelete = useCallback(() => {
    deleteEmails.mutate([emailId]);
    router.push("/mail/inbox");
  }, [emailId, deleteEmails, router]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading email...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !email) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-900">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-neutral-400" />
          <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
            Email not found
          </h2>
          <p className="mb-4 text-neutral-500 dark:text-neutral-400">
            {error instanceof Error ? error.message : "This email may have been deleted or moved."}
          </p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inbox
          </Button>
        </div>
      </div>
    );
  }

  // Format date
  const emailDate = new Date(email.receivedAt ?? email.createdAt);
  const formattedDate = emailDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = emailDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleBack} title="Back to inbox">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleReply} title="Reply">
            <Reply className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReplyAll} title="Reply All">
            <ReplyAll className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleForward} title="Forward">
            <Forward className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleStar}
            title={email.isStarred ? "Unstar" : "Star"}
          >
            <Star className={cn("h-4 w-4", email.isStarred && "fill-yellow-400 text-yellow-400")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleArchive} title="Archive">
            <Archive className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Move to Trash
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowFullHeaders(!showFullHeaders)}>
                <Tag className="mr-2 h-4 w-4" />
                {showFullHeaders ? "Hide" : "Show"} full headers
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          {/* Subject */}
          <h1 className="mb-4 text-2xl font-bold text-neutral-900 dark:text-white">
            {email.subject || "(No subject)"}
          </h1>

          {/* Labels */}
          {email.labels && email.labels.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1">
              {email.labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs">
                  {label}
                </Badge>
              ))}
            </div>
          )}

          {/* Sender info */}
          <div className="mb-6 flex items-start justify-between rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {(email.from.name || email.from.address).charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {email.from.name || email.from.address}
                  </span>
                  {email.from.name && (
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      &lt;{email.from.address}&gt;
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  To: {email.to.map((t) => t.name || t.address).join(", ")}
                </div>
                {email.cc && email.cc.length > 0 && (
                  <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                    Cc: {email.cc.map((c) => c.name || c.address).join(", ")}
                  </div>
                )}
                {email.bcc && email.bcc.length > 0 && (
                  <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                    Bcc: {email.bcc.map((b) => b.name || b.address).join(", ")}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right text-sm text-neutral-500 dark:text-neutral-400">
              <div>{formattedDate}</div>
              <div>{formattedTime}</div>
            </div>
          </div>

          {/* Full headers (togglable) */}
          {showFullHeaders && (
            <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Full Headers
              </h3>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-neutral-600 dark:text-neutral-400">
                {`From: ${email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}
To: ${email.to.map((t) => (t.name ? `${t.name} <${t.address}>` : t.address)).join(", ")}
${email.cc?.length ? `Cc: ${email.cc.map((c) => (c.name ? `${c.name} <${c.address}>` : c.address)).join(", ")}\n` : ""}Subject: ${email.subject || "(No subject)"}
Date: ${emailDate.toISOString()}
Message-ID: ${email.id}`}
              </pre>
            </div>
          )}

          {/* Email body */}
          <div className="prose dark:prose-invert max-w-none">
            {email.htmlBody ? (
              <div className="email-content" dangerouslySetInnerHTML={{ __html: email.htmlBody }} />
            ) : (
              <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
                {email.textBody || email.snippet || "No content"}
              </p>
            )}
          </div>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <Paperclip className="h-4 w-4" />
                {email.attachments.length} Attachment{email.attachments.length > 1 ? "s" : ""}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {email.attachments.map((attachment) => (
                  <div
                    key={attachment.id || attachment.filename}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800">
                      <Paperclip className="h-5 w-5 text-neutral-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                        {attachment.filename}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : ""}
                        {attachment.mimeType ? ` · ${attachment.mimeType}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reply actions at bottom */}
          <div className="mt-8 flex gap-2 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            <Button variant="outline" onClick={handleReply}>
              <Reply className="mr-2 h-4 w-4" />
              Reply
            </Button>
            <Button variant="outline" onClick={handleReplyAll}>
              <ReplyAll className="mr-2 h-4 w-4" />
              Reply All
            </Button>
            <Button variant="outline" onClick={handleForward}>
              <Forward className="mr-2 h-4 w-4" />
              Forward
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOADING FALLBACK
// ============================================================

function EmailDetailLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading email...</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE EXPORT
// ============================================================

export default function EmailDetailPage() {
  return (
    <Suspense fallback={<EmailDetailLoading />}>
      <EmailDetailContent />
    </Suspense>
  );
}
