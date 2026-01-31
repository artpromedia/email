/* eslint-disable jsx-a11y/no-autofocus */
"use client";

/**
 * Login Page - Multi-domain aware login with smart domain detection
 *
 * Features:
 * - Smart domain detection as user types email
 * - Domain-specific branding display
 * - SSO button for SSO-enabled domains
 * - Password field hidden for SSO-only domains
 * - MFA support
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Building2,
  Shield,
  ArrowRight,
  Loader2,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  useDomainBrandingFor,
} from "@email/ui";
import { useLogin, useDomainDetection, useInitiateSSOLogin, type DomainInfo } from "@/lib/auth";

// Form validation schema
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  twoFactorCode: z.string().optional(),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// Debounce hook for email domain detection
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/";
  const prefilledEmail = searchParams.get("email") ?? "";

  const [showPassword, setShowPassword] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [detectedDomain, setDetectedDomain] = useState<DomainInfo | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: prefilledEmail,
      password: "",
      rememberMe: false,
    },
  });

  const email = watch("email");
  const debouncedEmail = useDebounce(email, 500);

  // Domain detection
  const { data: domainInfo, isLoading: isDetectingDomain } = useDomainDetection(
    debouncedEmail,
    debouncedEmail.includes("@") && debouncedEmail.split("@")[1]?.includes(".")
  );

  // Get domain branding
  const domainFromEmail = email.split("@")[1] ?? "";
  const branding = useDomainBrandingFor(domainFromEmail);

  // Login mutation
  const loginMutation = useLogin();
  const ssoMutation = useInitiateSSOLogin();

  // Update detected domain when API returns
  useEffect(() => {
    if (domainInfo !== undefined) {
      setDetectedDomain(domainInfo);
    }
  }, [domainInfo]);

  // Handle form submission
  const onSubmit = async (data: LoginFormData) => {
    try {
      const response = await loginMutation.mutateAsync({
        email: data.email,
        password: data.password,
        twoFactorCode: data.twoFactorCode,
        rememberMe: data.rememberMe,
      });

      if (response.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }

      // Successful login
      router.push(returnUrl);
    } catch (error) {
      // Error handled by mutation
      console.error("Login failed:", error);
    }
  };

  // Handle SSO login
  const handleSSOLogin = useCallback(() => {
    if (detectedDomain?.domain) {
      ssoMutation.mutate(detectedDomain.domain);
    }
  }, [detectedDomain, ssoMutation]);

  // Determine login options based on domain
  const showPasswordLogin = !detectedDomain || detectedDomain.passwordLoginEnabled;
  const showSSOLogin = detectedDomain?.ssoEnabled;
  const ssoOnly = detectedDomain?.ssoEnabled && !detectedDomain.passwordLoginEnabled;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        {/* Domain Logo */}
        {branding?.logo ? (
          <div className="flex justify-center">
            <img
              src={branding.logo}
              alt={branding?.displayName || "Organization"}
              className="h-12 w-auto object-contain"
            />
          </div>
        ) : (
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: branding?.primaryColor || "var(--primary)" }}
          >
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
        )}

        <div>
          <CardTitle className="text-2xl">
            {branding?.displayName ? `Sign in to ${branding?.displayName}` : "Sign in"}
          </CardTitle>
          <CardDescription className="mt-2">
            Enter your credentials to access your account
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="pl-10 pr-10"
                autoComplete="email"
                autoFocus
                {...register("email")}
              />
              {isDetectingDomain && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {errors.email && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Domain Detection Indicator */}
          {detectedDomain && (
            <div
              className="flex items-center gap-2 rounded-lg p-3 text-sm"
              style={{
                backgroundColor: branding?.primaryColor
                  ? `${branding.primaryColor}15`
                  : "var(--muted)",
              }}
            >
              <Building2 className="h-4 w-4" style={{ color: branding?.primaryColor }} />
              <span>
                Signing in to <strong>{detectedDomain.organizationName}</strong>
              </span>
              {detectedDomain.ssoEnabled && (
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  SSO Available
                </span>
              )}
            </div>
          )}

          {/* 2FA Code Field (shown when required) */}
          {requiresTwoFactor && (
            <div className="space-y-2">
              <Label htmlFor="twoFactorCode">Two-Factor Code</Label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="twoFactorCode"
                  type="text"
                  placeholder="000000"
                  className="pl-10 text-center text-lg tracking-widest"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  {...register("twoFactorCode")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          )}

          {/* Password Field (hidden for SSO-only domains) */}
          {showPasswordLogin && !requiresTwoFactor && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                  autoComplete="current-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password.message}
                </p>
              )}
            </div>
          )}

          {/* Remember Me */}
          {showPasswordLogin && !requiresTwoFactor && (
            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register("rememberMe")}
              />
              <Label htmlFor="rememberMe" className="cursor-pointer text-sm font-normal">
                Remember me for 30 days
              </Label>
            </div>
          )}

          {/* Error Message */}
          {loginMutation.error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                {loginMutation.error instanceof Error
                  ? loginMutation.error.message
                  : "Login failed. Please try again."}
              </span>
            </div>
          )}

          {/* Submit Button */}
          {showPasswordLogin && (
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || loginMutation.isPending}
              style={
                branding?.primaryColor ? { backgroundColor: branding.primaryColor } : undefined
              }
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : requiresTwoFactor ? (
                <>
                  Verify
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {/* SSO Divider */}
          {showPasswordLogin && showSSOLogin && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
          )}

          {/* SSO Button */}
          {showSSOLogin && (
            <Button
              type="button"
              variant={ssoOnly ? "default" : "outline"}
              className="w-full"
              onClick={handleSSOLogin}
              disabled={ssoMutation.isPending}
              style={
                ssoOnly && branding?.primaryColor
                  ? { backgroundColor: branding.primaryColor }
                  : undefined
              }
            >
              {ssoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to SSO...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  {detectedDomain?.ssoProvider === "google" && "Continue with Google"}
                  {detectedDomain?.ssoProvider === "microsoft" && "Continue with Microsoft"}
                  {detectedDomain?.ssoProvider === "okta" && "Continue with Okta"}
                  {(detectedDomain?.ssoProvider === "saml" ||
                    detectedDomain?.ssoProvider === "oidc") &&
                    `Continue with ${detectedDomain.organizationName} SSO`}
                  {!detectedDomain?.ssoProvider && "Continue with SSO"}
                </>
              )}
            </Button>
          )}
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-4">
        {/* Registration Link */}
        {(!detectedDomain || detectedDomain.registrationEnabled) && (
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={`/register${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        )}

        {/* Help Link */}
        <p className="text-center text-xs text-muted-foreground">
          Having trouble signing in?{" "}
          <Link href="/help/login" className="text-primary hover:underline">
            Get help
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
