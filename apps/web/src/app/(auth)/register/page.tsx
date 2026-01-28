"use client";

/**
 * Registration Page - Domain-aware user registration
 * 
 * Features:
 * - Email domain validation and organization detection
 * - Domain-specific branding
 * - Password strength requirements
 * - Terms acceptance
 * - Redirect to login if registration disabled for domain
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Building2,
  ArrowRight,
  Loader2,
  AlertCircle,
  Check,
  X,
  Info,
} from "lucide-react";
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
import { useRegister, useDomainDetection, type DomainInfo } from "@/lib/auth";

// Password requirements
const passwordRequirements = [
  { id: "length", label: "At least 12 characters", regex: /.{12,}/ },
  { id: "uppercase", label: "One uppercase letter", regex: /[A-Z]/ },
  { id: "lowercase", label: "One lowercase letter", regex: /[a-z]/ },
  { id: "number", label: "One number", regex: /\d/ },
  { id: "special", label: "One special character", regex: /[^A-Za-z0-9]/ },
];

// Form validation schema
const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    firstName: z.string().min(1, "First name is required").max(100),
    lastName: z.string().min(1, "Last name is required").max(100),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/\d/, "Password must contain a number")
      .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

// Debounce hook
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

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email") || "";

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [detectedDomain, setDetectedDomain] = useState<DomainInfo | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: prefilledEmail,
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const email = watch("email");
  const password = watch("password");
  const debouncedEmail = useDebounce(email, 500);

  // Domain detection
  const { data: domainInfo, isLoading: isDetectingDomain } = useDomainDetection(
    debouncedEmail,
    debouncedEmail.includes("@") && debouncedEmail.split("@")[1]?.includes(".")
  );

  // Get domain branding
  const domainFromEmail = email.split("@")[1];
  const branding = useDomainBrandingFor(domainFromEmail);

  // Register mutation
  const registerMutation = useRegister();

  // Update detected domain when API returns
  useEffect(() => {
    if (domainInfo !== undefined) {
      setDetectedDomain(domainInfo);
    }
  }, [domainInfo]);

  // Check password requirements
  const getPasswordStrength = (pwd: string) => {
    return passwordRequirements.map((req) => ({
      ...req,
      met: req.regex.test(pwd),
    }));
  };

  const passwordStrength = getPasswordStrength(password);
  const allRequirementsMet = passwordStrength.every((req) => req.met);

  // Handle form submission
  const onSubmit = async (data: RegisterFormData) => {
    try {
      const response = await registerMutation.mutateAsync({
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        acceptTerms: data.acceptTerms,
      });

      if (response.emailVerificationRequired) {
        router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Registration failed:", error);
    }
  };

  // Check if registration is disabled for this domain
  if (detectedDomain && !detectedDomain.registrationEnabled) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="text-center space-y-4">
          {branding?.logo ? (
            <div className="flex justify-center">
              <img
                src={branding.logo}
                alt={branding.name || "Organization"}
                className="h-12 w-auto object-contain"
              />
            </div>
          ) : (
            <div
              className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: branding?.primaryColor || "var(--primary)" }}
            >
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          )}

          <div>
            <CardTitle className="text-2xl">Registration Unavailable</CardTitle>
            <CardDescription className="mt-2">
              Self-registration is not available for{" "}
              <strong>{detectedDomain.organizationName}</strong>.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted text-sm">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Contact your administrator</p>
                <p className="mt-1 text-muted-foreground">
                  Your organization requires administrator approval for new accounts.
                  Please contact your IT administrator to request access.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href={`/login?email=${encodeURIComponent(email)}`}>
                Back to Sign In
              </Link>
            </Button>
            {detectedDomain.ssoEnabled && (
              <Button asChild variant="outline" className="w-full">
                <Link href={`/login/sso?domain=${detectedDomain.domain}`}>
                  Sign in with SSO
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0">
      <CardHeader className="text-center space-y-4">
        {/* Domain Logo */}
        {branding?.logo ? (
          <div className="flex justify-center">
            <img
              src={branding.logo}
              alt={branding.name || "Organization"}
              className="h-12 w-auto object-contain"
            />
          </div>
        ) : (
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: branding?.primaryColor || "var(--primary)" }}
          >
            <User className="h-6 w-6 text-primary-foreground" />
          </div>
        )}

        <div>
          <CardTitle className="text-2xl">
            {branding?.name ? `Join ${branding.name}` : "Create an account"}
          </CardTitle>
          <CardDescription className="mt-2">
            Enter your details to get started
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                className="pl-10 pr-10"
                autoComplete="email"
                autoFocus
                {...register("email")}
              />
              {isDetectingDomain && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {errors.email && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Domain Detection Indicator */}
          {detectedDomain && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{
                backgroundColor: branding?.primaryColor
                  ? `${branding.primaryColor}15`
                  : "var(--muted)",
              }}
            >
              <Building2
                className="h-4 w-4"
                style={{ color: branding?.primaryColor }}
              />
              <span>
                You&apos;re joining <strong>{detectedDomain.organizationName}</strong>
              </span>
              <Check className="ml-auto h-4 w-4 text-green-500" />
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="John"
                autoComplete="given-name"
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Doe"
                autoComplete="family-name"
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
                className="pl-10 pr-10"
                autoComplete="new-password"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Password Requirements */}
            {password && (
              <div className="mt-2 space-y-1">
                {passwordStrength.map((req) => (
                  <div
                    key={req.id}
                    className={`flex items-center gap-2 text-xs ${
                      req.met ? "text-green-600" : "text-muted-foreground"
                    }`}
                  >
                    {req.met ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    {req.label}
                  </div>
                ))}
              </div>
            )}

            {errors.password && !password && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                className="pl-10 pr-10"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Terms Acceptance */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input
                id="acceptTerms"
                type="checkbox"
                className="h-4 w-4 rounded border-input mt-0.5"
                {...register("acceptTerms")}
              />
              <Label
                htmlFor="acceptTerms"
                className="text-sm font-normal cursor-pointer leading-relaxed"
              >
                I agree to the{" "}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </Label>
            </div>
            {errors.acceptTerms && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.acceptTerms.message}
              </p>
            )}
          </div>

          {/* Error Message */}
          {registerMutation.error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                {registerMutation.error instanceof Error
                  ? registerMutation.error.message
                  : "Registration failed. Please try again."}
              </span>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || registerMutation.isPending || !allRequirementsMet}
            style={
              branding?.primaryColor ? { backgroundColor: branding.primaryColor } : undefined
            }
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-4">
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
