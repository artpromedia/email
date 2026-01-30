"use client";

import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Flag,
  AlertTriangle,
  CheckCircle,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

interface SpamActionsProps {
  emailId: string;
  senderEmail: string;
  currentFolder?: "inbox" | "spam" | "quarantine";
  isSpam?: boolean;
  isPhishing?: boolean;
  onAction?: (action: SpamAction, emailId: string) => void;
  onReportPhishing?: (emailId: string, senderEmail: string) => void;
  compact?: boolean;
  className?: string;
}

type SpamAction =
  | "mark_spam"
  | "mark_not_spam"
  | "mark_safe"
  | "report_phishing"
  | "block_sender"
  | "whitelist_sender";

interface ActionState {
  loading: boolean;
  success: boolean;
  error: string | null;
}

// ============================================================
// SPAM ACTIONS COMPONENT
// ============================================================

export function SpamActions({
  emailId,
  senderEmail,
  currentFolder = "inbox",
  isSpam = false,
  isPhishing = false,
  onAction,
  onReportPhishing,
  compact = false,
  className,
}: SpamActionsProps) {
  const [actionState, setActionState] = useState<Record<SpamAction, ActionState>>({
    mark_spam: { loading: false, success: false, error: null },
    mark_not_spam: { loading: false, success: false, error: null },
    mark_safe: { loading: false, success: false, error: null },
    report_phishing: { loading: false, success: false, error: null },
    block_sender: { loading: false, success: false, error: null },
    whitelist_sender: { loading: false, success: false, error: null },
  });

  const handleAction = async (action: SpamAction) => {
    setActionState((prev) => ({
      ...prev,
      [action]: { loading: true, success: false, error: null },
    }));

    try {
      // API call would go here
      const endpoint = getEndpointForAction(action);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          sender_email: senderEmail,
        }),
      });

      if (!response.ok) throw new Error("Action failed");

      setActionState((prev) => ({
        ...prev,
        [action]: { loading: false, success: true, error: null },
      }));

      onAction?.(action, emailId);

      // Reset success state after delay
      setTimeout(() => {
        setActionState((prev) => ({
          ...prev,
          [action]: { loading: false, success: false, error: null },
        }));
      }, 2000);
    } catch (error) {
      setActionState((prev) => ({
        ...prev,
        [action]: {
          loading: false,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    }
  };

  const getEndpointForAction = (action: SpamAction): string => {
    switch (action) {
      case "mark_spam":
        return "/api/v1/threat/feedback/spam";
      case "mark_not_spam":
        return "/api/v1/threat/feedback/not-spam";
      case "mark_safe":
        return "/api/v1/threat/feedback/safe";
      case "report_phishing":
        return "/api/v1/threat/feedback/phishing";
      case "block_sender":
        return "/api/v1/threat/reputation/block";
      case "whitelist_sender":
        return "/api/v1/threat/reputation/whitelist";
      default:
        return "";
    }
  };

  // Render compact version (for email list)
  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center gap-1", className)}>
          {currentFolder === "spam" || isSpam ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleAction("mark_not_spam")}
                  disabled={actionState.mark_not_spam.loading}
                >
                  {actionState.mark_not_spam.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : actionState.mark_not_spam.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Not Spam</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleAction("mark_spam")}
                  disabled={actionState.mark_spam.loading}
                >
                  {actionState.mark_spam.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : actionState.mark_spam.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as Spam</TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onReportPhishing?.(emailId, senderEmail)}>
                <Flag className="mr-2 h-4 w-4 text-red-500" />
                Report Phishing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAction("block_sender")}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                Block Sender
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAction("whitelist_sender")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Always Allow Sender
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    );
  }

  // Render full version (for email detail view)
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {currentFolder === "spam" || isSpam ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction("mark_not_spam")}
            disabled={actionState.mark_not_spam.loading}
            className="flex items-center gap-2"
          >
            {actionState.mark_not_spam.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : actionState.mark_not_spam.success ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Not Spam
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction("mark_safe")}
            disabled={actionState.mark_safe.loading}
            className="flex items-center gap-2"
          >
            {actionState.mark_safe.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : actionState.mark_safe.success ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-green-600" />
            )}
            Mark as Safe
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction("mark_spam")}
          disabled={actionState.mark_spam.loading}
          className="flex items-center gap-2"
        >
          {actionState.mark_spam.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : actionState.mark_spam.success ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          Report Spam
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onReportPhishing?.(emailId, senderEmail)}
        className="flex items-center gap-2 text-red-600 hover:text-red-700"
      >
        <Flag className="h-4 w-4" />
        Report Phishing
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => handleAction("block_sender")}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            Block Sender
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction("whitelist_sender")}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Always Allow Sender
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Warning banner for potential threats */}
      {isPhishing && (
        <div className="mt-2 flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 dark:text-red-300">
            This email was flagged as a potential phishing attempt
          </span>
        </div>
      )}

      {isSpam && !isPhishing && (
        <div className="mt-2 flex w-full items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-800 dark:bg-yellow-950">
          <ShieldAlert className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-700 dark:text-yellow-300">
            This email was detected as spam
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SPAM INDICATOR BADGE
// ============================================================

interface SpamIndicatorProps {
  verdict: "clean" | "spam" | "phishing" | "suspicious";
  score?: number;
  compact?: boolean;
}

export function SpamIndicator({ verdict, score, compact = false }: SpamIndicatorProps) {
  const config = {
    clean: {
      icon: ShieldCheck,
      label: "Safe",
      color: "text-green-600 bg-green-50 border-green-200",
    },
    suspicious: {
      icon: AlertTriangle,
      label: "Suspicious",
      color: "text-yellow-600 bg-yellow-50 border-yellow-200",
    },
    spam: {
      icon: ShieldAlert,
      label: "Spam",
      color: "text-orange-600 bg-orange-50 border-orange-200",
    },
    phishing: {
      icon: Flag,
      label: "Phishing",
      color: "text-red-600 bg-red-50 border-red-200",
    },
  };

  const { icon: Icon, label, color } = config[verdict];

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className={cn("rounded border p-1", color)}>
              <Icon className="h-3 w-3" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
            {score !== undefined && (
              <p className="text-xs text-muted-foreground">Score: {(score * 100).toFixed(0)}%</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium",
        color
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {score !== undefined && (
        <span className="text-muted-foreground">({(score * 100).toFixed(0)}%)</span>
      )}
    </div>
  );
}

export default SpamActions;
