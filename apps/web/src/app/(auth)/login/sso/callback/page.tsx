"use client";

/**
 * SSO Callback Page - Handles SSO provider callback
 *
 * Features:
 * - Processes authorization code from SSO provider
 * - Validates state parameter
 * - Completes authentication flow
 * - Handles errors gracefully
 */

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@email/ui";
import { useCompleteSSOCallback } from "@/lib/auth";

// Helper to extract domain from state (if encoded)
function extractDomainFromState(stateParam: string): string | null {
  try {
    // Try to decode if it's base64 JSON
    const decoded = JSON.parse(atob(stateParam)) as { domain?: string };
    return decoded.domain ?? null;
  } catch {
    // If not encoded, try getting from URL or return null
    return null;
  }
}

// Loading fallback component
function SSOCallbackLoadingFallback() {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <KeyRound className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <CardTitle className="text-2xl">Processing SSO...</CardTitle>
          <CardDescription className="mt-2">Please wait</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </CardContent>
    </Card>
  );
}

function SSOCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const [callbackAttempted, setCallbackAttempted] = useState(false);
  const [success, setSuccess] = useState(false);

  // Get stored state and domain from session storage
  const storedState = typeof window !== "undefined" ? sessionStorage.getItem("sso_state") : null;
  const storedDomain = typeof window !== "undefined" ? sessionStorage.getItem("sso_domain") : null;

  // SSO callback mutation
  const callbackMutation = useCompleteSSOCallback();

  // Process callback on mount
  useEffect(() => {
    if (callbackAttempted) return;

    // Check for error from provider
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCallbackAttempted(true);
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      setCallbackAttempted(true);
      return;
    }

    // Validate state matches
    if (state !== storedState) {
      setCallbackAttempted(true);
      return;
    }

    // Extract domain from state or use stored domain
    const domain = storedDomain ?? extractDomainFromState(state);
    if (!domain) {
      setCallbackAttempted(true);
      return;
    }

    setCallbackAttempted(true);

    // Complete the callback
    callbackMutation.mutate(
      { domain, request: { code, state } },
      {
        onSuccess: () => {
          setSuccess(true);
          // Redirect to main app after a brief success message
          setTimeout(() => {
            router.push("/");
          }, 1500);
        },
      }
    );
  }, [code, state, error, storedState, storedDomain, callbackAttempted, callbackMutation, router]);

  // Provider error
  if (error) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <div>
            <CardTitle className="text-2xl">Authentication Failed</CardTitle>
            <CardDescription className="mt-2">
              Your identity provider returned an error
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">
              {error === "access_denied"
                ? "You denied access to your account"
                : error === "server_error"
                  ? "The identity provider encountered an error"
                  : error === "temporarily_unavailable"
                    ? "The identity provider is temporarily unavailable"
                    : `Error: ${error}`}
            </p>
            {errorDescription && <p className="mt-2 text-muted-foreground">{errorDescription}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Missing parameters
  if (!code || !state) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <div>
            <CardTitle className="text-2xl">Invalid Callback</CardTitle>
            <CardDescription className="mt-2">Missing required parameters</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-center text-sm">
            <p>
              This page should only be accessed as part of an SSO login flow. Please start the login
              process again.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go to Login
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State mismatch
  if (state !== storedState) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <div>
            <CardTitle className="text-2xl">Security Error</CardTitle>
            <CardDescription className="mt-2">Session validation failed</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-destructive/10 p-4 text-sm">
            <p className="text-destructive">
              The security state does not match. This could indicate a CSRF attack or an expired
              session.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4 text-center text-sm">
            <p>Please start the login process again from the beginning.</p>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Success state
  if (success) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-6 w-6 text-green-500" />
          </div>

          <div>
            <CardTitle className="text-2xl">Welcome Back!</CardTitle>
            <CardDescription className="mt-2">
              You&apos;ve been signed in successfully
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Redirecting to your inbox...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Processing state
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>

        <div>
          <CardTitle className="text-2xl">Completing Sign In</CardTitle>
          <CardDescription className="mt-2">
            Please wait while we verify your identity
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Loading Animation */}
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="animate-pulse text-sm text-muted-foreground">
            Verifying your credentials...
          </p>
        </div>

        {/* Error from callback */}
        {callbackMutation.error && (
          <>
            <div className="rounded-lg bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Authentication failed</p>
                  <p className="mt-1 text-muted-foreground">
                    {callbackMutation.error instanceof Error
                      ? callbackMutation.error.message
                      : "We couldn't complete your sign-in. Please try again."}
                  </p>
                </div>
              </div>
            </div>

            <Button asChild className="w-full">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Export wrapped in Suspense for Next.js static generation
export default function SSOCallbackPage() {
  return (
    <Suspense fallback={<SSOCallbackLoadingFallback />}>
      <SSOCallbackContent />
    </Suspense>
  );
}
