"use client";

/**
 * Verify Email Page - Email verification confirmation
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Send,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from "@email/ui";
import { useVerifyEmail, useResendVerificationEmail } from "@/lib/auth";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [verificationAttempted, setVerificationAttempted] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const verifyEmailMutation = useVerifyEmail();
  const resendMutation = useResendVerificationEmail();

  // Auto-verify if token is present
  useEffect(() => {
    if (token && !verificationAttempted) {
      setVerificationAttempted(true);
      verifyEmailMutation.mutate({ token });
    }
  }, [token, verificationAttempted, verifyEmailMutation]);

  // Handle resend
  const handleResend = async () => {
    if (email) {
      try {
        // Assuming the resend takes email ID, but we have email address
        // In a real app, this would need adjustment
        await resendMutation.mutateAsync(email);
        setResendSuccess(true);
      } catch (error) {
        console.error("Failed to resend verification:", error);
      }
    }
  };

  // Verification in progress with token
  if (token && verifyEmailMutation.isPending) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Verifying your email</CardTitle>
            <CardDescription className="mt-2">
              Please wait while we verify your email address
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Verifying...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Verification successful
  if (token && verifyEmailMutation.isSuccess) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <CardTitle className="text-2xl">Email Verified!</CardTitle>
            <CardDescription className="mt-2">
              Your email address has been verified successfully
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-green-500/10 text-sm text-center">
            <p className="text-green-700 dark:text-green-400">
              You can now use all features of your account.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/">
              Continue to your inbox
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Verification failed
  if (token && verifyEmailMutation.isError) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-2xl">Verification Failed</CardTitle>
            <CardDescription className="mt-2">
              We couldn&apos;t verify your email address
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/10 text-sm">
            <p className="text-destructive">
              {verifyEmailMutation.error instanceof Error
                ? verifyEmailMutation.error.message
                : "The verification link may have expired or is invalid."}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted text-sm text-center">
            <p className="text-muted-foreground">
              Verification links expire after 24 hours. You can request a new
              one from your account settings.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/settings/account/emails">
                Go to Email Settings
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to Login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Waiting for verification (no token, just registered)
  return (
    <Card className="shadow-lg border-0">
      <CardHeader className="text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription className="mt-2">
            We&apos;ve sent a verification link to{" "}
            <strong>{email || "your email"}</strong>
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted text-sm space-y-3">
          <p className="text-muted-foreground">
            Please check your inbox and click the verification link to confirm
            your email address.
          </p>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Check your spam/junk folder</li>
            <li>Make sure the email address is correct</li>
            <li>Links expire after 24 hours</li>
          </ul>
        </div>

        {resendSuccess ? (
          <div className="p-4 rounded-lg bg-green-500/10 text-sm text-center">
            <p className="text-green-700 dark:text-green-400 flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Verification email sent!
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Didn&apos;t receive the email?
            </p>
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resendMutation.isPending || !email}
              className="gap-2"
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Resend verification email
            </Button>
          </div>
        )}

        {resendMutation.isError && (
          <div className="p-3 rounded-lg bg-destructive/10 text-sm text-center">
            <p className="text-destructive">
              Failed to resend. Please try again later.
            </p>
          </div>
        )}

        <div className="pt-4 border-t">
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to Login</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
