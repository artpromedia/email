"use client";

/**
 * SSO Login Page - Handles SSO initiation and callback
 *
 * Features:
 * - Domain parameter handling for direct SSO links
 * - SSO provider redirect
 * - Loading state with domain branding
 */

import React, { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, Loader2, AlertCircle, Building2, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  useDomainBrandingFor,
} from "@email/ui";
import { useInitiateSSOLogin, useDomainDetection } from "@/lib/auth";

// Helper to get SSO error message
function getSSOErrorMessage(error: string): string {
  switch (error) {
    case "access_denied":
      return "Access was denied by your identity provider";
    case "invalid_state":
      return "Invalid session state. Please try again.";
    case "user_not_found":
      return "No account found for your identity";
    default:
      return "An error occurred during SSO authentication";
  }
}

// Helper to get loading status message
function getLoadingMessage(isPending: boolean, isLoadingDomain: boolean): string {
  if (isPending) {
    return "Redirecting to your identity provider...";
  }
  if (isLoadingDomain) {
    return "Checking organization settings...";
  }
  return "Preparing SSO login...";
}

// Loading fallback component
function SSOLoadingFallback() {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <CardTitle className="text-2xl">Loading SSO...</CardTitle>
          <CardDescription className="mt-2">Please wait</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </CardContent>
    </Card>
  );
}

// Inner component that uses useSearchParams
function SSOLoginContent() {
  const searchParams = useSearchParams();
  const domain = searchParams.get("domain");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const initiatedSSORef = React.useRef(false);

  // Domain detection for branding
  const { data: domainInfo, isLoading: isLoadingDomain } = useDomainDetection(
    domain ? `user@${domain}` : "",
    !!domain
  );

  // Get domain branding
  const branding = useDomainBrandingFor(domain ?? "");

  // SSO initiation mutation
  const ssoMutation = useInitiateSSOLogin();

  // Auto-initiate SSO if domain is provided and no error
  useEffect(() => {
    if (domain && !error && !initiatedSSORef.current && domainInfo?.ssoEnabled) {
      initiatedSSORef.current = true;
      ssoMutation.mutate(domain);
    }
  }, [domain, error, domainInfo, ssoMutation]);

  // Handle manual SSO initiation
  const handleInitiateSSO = () => {
    if (domain) {
      ssoMutation.mutate(domain);
    }
  };

  // Error state
  if (error) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <div>
            <CardTitle className="text-2xl">SSO Login Failed</CardTitle>
            <CardDescription className="mt-2">
              We couldn&apos;t complete your sign-in
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">{getSSOErrorMessage(error)}</p>
            {errorDescription && <p className="mt-2 text-muted-foreground">{errorDescription}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleInitiateSSO} className="w-full">
              <KeyRound className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button asChild variant="outline" className="w-full">
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

  // No domain provided
  if (!domain) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>

          <div>
            <CardTitle className="text-2xl">SSO Login</CardTitle>
            <CardDescription className="mt-2">No domain specified for SSO login</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-center text-sm">
            <p>
              Please use the login page to enter your email address. We&apos;ll automatically detect
              if your organization uses SSO.
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

  // Domain not SSO enabled
  if (domainInfo && !domainInfo.ssoEnabled) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          {branding.logo ? (
            <div className="flex justify-center">
              <img
                src={branding.logo}
                alt={branding.displayName || "Organization"}
                className="h-12 w-auto object-contain"
              />
            </div>
          ) : (
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: branding.primaryColor || "var(--primary)" }}
            >
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          )}

          <div>
            <CardTitle className="text-2xl">SSO Not Available</CardTitle>
            <CardDescription className="mt-2">
              {domainInfo.organizationName} does not have SSO enabled
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-center text-sm">
            <p>
              Single Sign-On is not configured for this organization. Please use email and password
              to sign in.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Sign in with Password
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading/redirecting state
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        {branding.logo ? (
          <div className="flex justify-center">
            <img
              src={branding.logo}
              alt={branding.displayName || "Organization"}
              className="h-12 w-auto object-contain"
            />
          </div>
        ) : (
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: branding.primaryColor || "var(--primary)" }}
          >
            <KeyRound className="h-6 w-6 text-primary-foreground" />
          </div>
        )}

        <div>
          <CardTitle className="text-2xl">
            {isLoadingDomain ? "Loading..." : "Redirecting to SSO"}
          </CardTitle>
          <CardDescription className="mt-2">
            {domainInfo.organizationName
              ? `Signing in to ${domainInfo.organizationName}`
              : "Please wait while we redirect you"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Loading Animation */}
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: branding.primaryColor }} />
          <p className="animate-pulse text-sm text-muted-foreground">
            {getLoadingMessage(ssoMutation.isPending, isLoadingDomain)}
          </p>
        </div>

        {/* Error from mutation */}
        {ssoMutation.error && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Failed to initiate SSO</p>
                <p className="mt-1 text-muted-foreground">
                  {ssoMutation.error instanceof Error
                    ? ssoMutation.error.message
                    : "Please try again or use password login."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Manual retry and back buttons */}
        <div className="flex flex-col gap-3">
          {ssoMutation.error && (
            <Button onClick={handleInitiateSSO} className="w-full">
              <KeyRound className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
          <Button asChild variant="ghost" className="w-full">
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

// Export wrapped in Suspense for Next.js static generation
export default function SSOLoginPage() {
  return (
    <Suspense fallback={<SSOLoadingFallback />}>
      <SSOLoginContent />
    </Suspense>
  );
}
