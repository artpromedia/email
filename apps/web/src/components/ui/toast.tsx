"use client";

/**
 * Toast Notification System
 * Provides user feedback for actions, errors, and status updates
 * Built on top of sonner for a smooth, accessible toast experience
 */

import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { toast as sonnerToast, Toaster as SonnerToaster, type ExternalToast } from "sonner";
import { cn } from "@email/ui";

// ============================================================
// TOAST CONFIGURATION
// ============================================================

export interface ToastOptions extends ExternalToast {
  /** Optional undo callback */
  onUndo?: () => void;
  /** Duration in milliseconds (default: 4000) */
  duration?: number;
}

// ============================================================
// TOAST FUNCTIONS
// ============================================================

/**
 * Show a success toast
 */
function success(message: string, options?: ToastOptions) {
  const { onUndo, ...rest } = options ?? {};

  return sonnerToast.success(message, {
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    duration: 4000,
    ...rest,
    action: onUndo
      ? {
          label: "Undo",
          onClick: onUndo,
        }
      : rest.action,
  });
}

/**
 * Show an error toast
 */
function error(message: string, options?: ToastOptions) {
  return sonnerToast.error(message, {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    duration: 6000,
    ...options,
  });
}

/**
 * Show a warning toast
 */
function warning(message: string, options?: ToastOptions) {
  return sonnerToast.warning(message, {
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    duration: 5000,
    ...options,
  });
}

/**
 * Show an info toast
 */
function info(message: string, options?: ToastOptions) {
  return sonnerToast.info(message, {
    icon: <Info className="h-5 w-5 text-blue-500" />,
    duration: 4000,
    ...options,
  });
}

/**
 * Show a loading toast (returns ID for updating)
 */
function loading(message: string, options?: ToastOptions) {
  return sonnerToast.loading(message, {
    icon: <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />,
    ...options,
  });
}

/**
 * Show a promise toast with loading, success, and error states
 */
function promise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: Error) => string);
  },
  options?: ToastOptions
) {
  return sonnerToast.promise(promise, {
    ...messages,
    ...options,
  });
}

/**
 * Dismiss a specific toast or all toasts
 */
function dismiss(toastId?: string | number) {
  sonnerToast.dismiss(toastId);
}

/**
 * Custom toast with full control
 */
function custom(message: string | React.ReactNode, options?: ToastOptions) {
  return sonnerToast(message, options);
}

// ============================================================
// EMAIL-SPECIFIC TOASTS
// ============================================================

/**
 * Toast for email sent successfully
 */
function emailSent(recipient: string, options?: ToastOptions) {
  return success(`Email sent to ${recipient}`, {
    description: "Message delivered successfully",
    ...options,
  });
}

/**
 * Toast for email send failure
 */
function emailFailed(errorMessage?: string, options?: ToastOptions) {
  return error("Failed to send email", {
    description: errorMessage ?? "Please try again or save as draft",
    ...options,
  });
}

/**
 * Toast for draft saved
 */
function draftSaved(options?: ToastOptions) {
  return success("Draft saved", {
    duration: 2000,
    ...options,
  });
}

/**
 * Toast for email moved
 */
function emailMoved(folder: string, count = 1, options?: ToastOptions) {
  const message = count === 1 ? `Email moved to ${folder}` : `${count} emails moved to ${folder}`;

  return success(message, {
    ...options,
  });
}

/**
 * Toast for email deleted
 */
function emailDeleted(count = 1, options?: ToastOptions) {
  const message = count === 1 ? "Email deleted" : `${count} emails deleted`;

  return success(message, {
    ...options,
  });
}

/**
 * Toast for marking emails as read/unread
 */
function emailMarked(action: "read" | "unread", count = 1, options?: ToastOptions) {
  const message = count === 1 ? `Marked as ${action}` : `${count} emails marked as ${action}`;

  return success(message, {
    duration: 2000,
    ...options,
  });
}

/**
 * Toast for network/connection errors
 */
function networkError(options?: ToastOptions) {
  return error("Connection error", {
    description: "Please check your internet connection and try again",
    ...options,
  });
}

/**
 * Toast for authentication errors
 */
function authError(options?: ToastOptions) {
  return error("Session expired", {
    description: "Please sign in again to continue",
    action: {
      label: "Sign In",
      onClick: () => {
        globalThis.location.href = "/auth/signin";
      },
    },
    ...options,
  });
}

// ============================================================
// EXPORT TOAST API
// ============================================================

export const toast = {
  // Base methods
  success,
  error,
  warning,
  info,
  loading,
  promise,
  dismiss,
  custom,

  // Email-specific methods
  emailSent,
  emailFailed,
  draftSaved,
  emailMoved,
  emailDeleted,
  emailMarked,
  networkError,
  authError,
};

// ============================================================
// TOASTER COMPONENT
// ============================================================

export interface ToasterProps {
  /** Position of toasts */
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  /** Whether to show close button */
  closeButton?: boolean;
  /** Rich colors mode */
  richColors?: boolean;
  /** Maximum number of visible toasts */
  visibleToasts?: number;
  /** Expand toasts on hover */
  expand?: boolean;
}

export function Toaster({
  position = "bottom-right",
  closeButton = true,
  richColors = true,
  visibleToasts = 4,
  expand = true,
}: Readonly<ToasterProps>) {
  return (
    <SonnerToaster
      position={position}
      closeButton={closeButton}
      richColors={richColors}
      visibleToasts={visibleToasts}
      expand={expand}
      toastOptions={{
        classNames: {
          toast: cn(
            "group toast",
            "bg-white dark:bg-neutral-900",
            "border border-neutral-200 dark:border-neutral-800",
            "shadow-lg rounded-lg",
            "text-neutral-900 dark:text-neutral-100"
          ),
          title: "font-medium text-sm",
          description: "text-xs text-neutral-500 dark:text-neutral-400",
          actionButton: cn(
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90",
            "text-xs font-medium px-3 py-1 rounded"
          ),
          cancelButton: cn(
            "bg-neutral-100 text-neutral-600",
            "hover:bg-neutral-200",
            "dark:bg-neutral-800 dark:text-neutral-300",
            "text-xs font-medium px-3 py-1 rounded"
          ),
          closeButton: cn(
            "bg-neutral-100 hover:bg-neutral-200",
            "dark:bg-neutral-800 dark:hover:bg-neutral-700",
            "border-neutral-200 dark:border-neutral-700"
          ),
          success: "border-green-200 dark:border-green-900",
          error: "border-red-200 dark:border-red-900",
          warning: "border-amber-200 dark:border-amber-900",
          info: "border-blue-200 dark:border-blue-900",
        },
      }}
    />
  );
}

export default Toaster;
