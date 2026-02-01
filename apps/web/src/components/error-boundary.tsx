"use client";

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@email/ui";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showStack: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error handler (e.g., for Sentry)
    this.props.onError?.(error, errorInfo);

    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      this.logErrorToService(error, errorInfo);
    }
  }

  logErrorToService(error: Error, errorInfo: ErrorInfo): void {
    // Send error to monitoring service
    // NOTE: Integrate with Sentry/DataDog/New Relic in production
    // Example: Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      url: typeof window === "undefined" ? "unknown" : window.location.href,
    };

    console.error("[Error Tracking]", errorReport);

    // Send to monitoring endpoint in production
    if (typeof fetch !== "undefined") {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(errorReport),
      }).catch((err: unknown) => console.error("Failed to send error report:", err));
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    });
  };

  handleRefresh = (): void => {
    globalThis.location.reload();
  };

  handleGoHome = (): void => {
    globalThis.location.href = "/";
  };

  toggleStack = (): void => {
    this.setState((prev) => ({ showStack: !prev.showStack }));
  };

  override render(): ReactNode {
    const { hasError, error, errorInfo, showStack } = this.state;
    const { children, fallback, showDetails = process.env.NODE_ENV !== "production" } = this.props;

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-6 shadow-lg dark:border-red-900 dark:bg-red-950">
            {/* Error Icon */}
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-3 dark:bg-red-900">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
                  Something went wrong
                </h2>
                <p className="text-sm text-red-600 dark:text-red-400">
                  An unexpected error has occurred
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div className="mb-4 rounded-md bg-red-100 p-3 dark:bg-red-900/50">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error?.message || "Unknown error"}
              </p>
            </div>

            {/* Error Details (Development) */}
            {showDetails && error && (
              <div className="mb-4">
                <button
                  onClick={this.toggleStack}
                  className="flex w-full items-center justify-between rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
                >
                  <span>Technical Details</span>
                  {showStack ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showStack && (
                  <div className="mt-2 max-h-48 overflow-auto rounded-md bg-neutral-900 p-3">
                    <pre className="text-xs text-neutral-300">
                      {error.stack}
                      {errorInfo?.componentStack && (
                        <>
                          {"\n\nComponent Stack:"}
                          {errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={this.handleReset} variant="default" className="flex-1 gap-2">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={this.handleRefresh} variant="outline" className="flex-1 gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
              <Button onClick={this.handleGoHome} variant="ghost" className="flex-1 gap-2">
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>

            {/* Help Text */}
            <p className="mt-4 text-center text-xs text-red-500 dark:text-red-400">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">
) {
  function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }
  return WithErrorBoundaryWrapper;
}

export default ErrorBoundary;
