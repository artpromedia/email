/* eslint-disable jsx-a11y/no-autofocus */
"use client";

/**
 * Signup Page - Self-service domain admin registration
 *
 * Creates organization + domain + admin user in one step.
 * Users enter their email, organization name, and domain to get started.
 */

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Building2,
  Globe,
  ArrowRight,
  Loader2,
  AlertCircle,
  Check,
  X,
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
} from "@email/ui";
import { useSignup } from "@/lib/auth";

// Password requirements
const passwordRequirements = [
  { id: "length", label: "At least 12 characters", regex: /.{12,}/ },
  { id: "uppercase", label: "One uppercase letter", regex: /[A-Z]/ },
  { id: "lowercase", label: "One lowercase letter", regex: /[a-z]/ },
  { id: "number", label: "One number", regex: /\d/ },
  { id: "special", label: "One special character", regex: /[^A-Za-z0-9]/ },
];

// Form validation schema
const signupSchema = z
  .object({
    organizationName: z.string().min(1, "Organization name is required").max(255),
    domainName: z
      .string()
      .min(3, "Domain name is required")
      .max(255)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Enter a valid domain (e.g., company.com)"
      ),
    displayName: z.string().min(1, "Your name is required").max(255),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/\d/, "Password must contain a number")
      .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => {
      const emailDomain = data.email.split("@")[1];
      return emailDomain?.toLowerCase() === data.domainName.toLowerCase();
    },
    {
      message: "Email must be on the domain you're registering",
      path: ["email"],
    }
  );

type SignupFormData = z.infer<typeof signupSchema>;

function getPasswordStrength(pwd: string) {
  return passwordRequirements.map((req) => ({
    ...req,
    met: req.regex.test(pwd),
  }));
}

function SignupContent() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      organizationName: "",
      domainName: "",
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");
  const domainName = watch("domainName");
  const signupMutation = useSignup();

  const passwordStrength = getPasswordStrength(password);
  const allRequirementsMet = passwordStrength.every((req) => req.met);

  // Auto-update email domain when domain changes
  const handleDomainBlur = () => {
    const email = watch("email");
    if (!email && domainName) {
      setValue("email", `admin@${domainName.toLowerCase()}`);
    }
  };

  const onSubmit = async (data: SignupFormData) => {
    try {
      await signupMutation.mutateAsync({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        organizationName: data.organizationName,
        domainName: data.domainName.toLowerCase(),
      });

      router.push("/");
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Building2 className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <CardTitle className="text-2xl">Create your email platform</CardTitle>
          <CardDescription className="mt-2">
            Set up your organization and domain to get started
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="organizationName"
                placeholder="Acme Inc."
                className="pl-10"
                autoFocus
                {...register("organizationName")}
              />
            </div>
            {errors.organizationName && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.organizationName.message}
              </p>
            )}
          </div>

          {/* Domain Name */}
          <div className="space-y-2">
            <Label htmlFor="domainName">Domain</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="domainName"
                placeholder="company.com"
                className="pl-10"
                {...register("domainName")}
                onBlur={handleDomainBlur}
              />
            </div>
            {errors.domainName && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.domainName.message}
              </p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Your name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="displayName"
                placeholder="John Doe"
                className="pl-10"
                {...register("displayName")}
              />
            </div>
            {errors.displayName && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.displayName.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Admin email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={domainName ? `admin@${domainName}` : "admin@company.com"}
                className="pl-10"
                autoComplete="email"
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                className="pl-10 pr-10"
                autoComplete="new-password"
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

            {/* Password strength */}
            {password && (
              <div className="grid grid-cols-2 gap-1 text-xs">
                {passwordStrength.map((req) => (
                  <div
                    key={req.id}
                    className={`flex items-center gap-1 ${req.met ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {req.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                className="pl-10 pr-10"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Error message */}
          {signupMutation.isError && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {signupMutation.error instanceof Error
                  ? signupMutation.error.message
                  : "Signup failed. Please try again."}
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || signupMutation.isPending || !allRequirementsMet}
          >
            {signupMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating your account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Joining an existing organization?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Register
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

// Loading fallback
function SignupLoadingFallback() {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Building2 className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <CardTitle className="text-2xl">Loading...</CardTitle>
          <CardDescription className="mt-2">Please wait</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<SignupLoadingFallback />}>
          <SignupContent />
        </Suspense>
      </div>
    </div>
  );
}
