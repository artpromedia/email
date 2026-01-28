"use client";

/**
 * Email Settings Page - Manage multiple email addresses
 * 
 * Features:
 * - List all email addresses
 * - Add new email addresses
 * - Set primary email
 * - Remove non-primary emails
 * - Resend verification
 * - Domain-aware display
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail,
  Plus,
  Trash2,
  Star,
  StarOff,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  DomainBadge,
} from "@email/ui";
import {
  useEmails,
  useAddEmail,
  useRemoveEmail,
  useSetPrimaryEmail,
  useResendVerificationEmail,
  type UserEmail,
} from "@/lib/auth";

// Add email form schema
const addEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type AddEmailFormData = z.infer<typeof addEmailSchema>;

export default function EmailSettingsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);

  // Queries and mutations
  const { data: emails, isLoading, error } = useEmails();
  const addEmailMutation = useAddEmail();
  const removeEmailMutation = useRemoveEmail();
  const setPrimaryMutation = useSetPrimaryEmail();
  const resendVerificationMutation = useResendVerificationEmail();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddEmailFormData>({
    resolver: zodResolver(addEmailSchema),
    defaultValues: {
      email: "",
    },
  });

  // Handle add email
  const onAddEmail = async (data: AddEmailFormData) => {
    try {
      await addEmailMutation.mutateAsync({ email: data.email });
      reset();
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to add email:", error);
    }
  };

  // Handle remove email
  const handleRemoveEmail = async (emailId: string) => {
    setDeletingEmailId(emailId);
    try {
      await removeEmailMutation.mutateAsync(emailId);
    } catch (error) {
      console.error("Failed to remove email:", error);
    } finally {
      setDeletingEmailId(null);
    }
  };

  // Handle set primary
  const handleSetPrimary = async (emailId: string) => {
    setSettingPrimaryId(emailId);
    try {
      await setPrimaryMutation.mutateAsync(emailId);
    } catch (error) {
      console.error("Failed to set primary email:", error);
    } finally {
      setSettingPrimaryId(null);
    }
  };

  // Handle resend verification
  const handleResendVerification = async (emailId: string) => {
    try {
      await resendVerificationMutation.mutateAsync(emailId);
    } catch (error) {
      console.error("Failed to resend verification:", error);
    }
  };

  // Sort emails: primary first, then verified, then unverified
  const sortedEmails = [...(emails || [])].sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    if (a.isVerified && !b.isVerified) return -1;
    if (!a.isVerified && b.isVerified) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Group by domain
  const emailsByDomain = sortedEmails.reduce((acc, email) => {
    const domain = email.domain;
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(email);
    return acc;
  }, {} as Record<string, UserEmail[]>);

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Email Addresses</h1>
        <p className="text-muted-foreground mt-2">
          Manage email addresses associated with your account. You can have multiple
          emails and use any of them to sign in.
        </p>
      </div>

      {/* Primary Email Info */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Primary Email</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your primary email is used for account notifications, password
                recovery, and security alerts. It cannot be removed until you set
                another email as primary.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading your email addresses...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">
                  Failed to load email addresses
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {error instanceof Error ? error.message : "Please try again later."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email List */}
      {!isLoading && !error && (
        <div className="space-y-6">
          {Object.entries(emailsByDomain).map(([domain, domainEmails]) => (
            <Card key={domain}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <DomainBadge domain={domain} />
                  <CardTitle className="text-lg">{domain}</CardTitle>
                </div>
                <CardDescription>
                  {domainEmails.length} email{domainEmails.length !== 1 ? "s" : ""}{" "}
                  registered
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {domainEmails.map((email) => (
                    <EmailRow
                      key={email.id}
                      email={email}
                      onSetPrimary={() => handleSetPrimary(email.id)}
                      onRemove={() => handleRemoveEmail(email.id)}
                      onResendVerification={() =>
                        handleResendVerification(email.id)
                      }
                      isSettingPrimary={settingPrimaryId === email.id}
                      isDeleting={deletingEmailId === email.id}
                      isResending={
                        resendVerificationMutation.isPending &&
                        resendVerificationMutation.variables === email.id
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add Email Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Email Address</CardTitle>
              <CardDescription>
                Add another email address to your account. You&apos;ll need to verify
                it before it can be used for sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showAddForm ? (
                <form onSubmit={handleSubmit(onAddEmail)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-email">New email address</Label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="new-email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10"
                          autoComplete="email"
                          autoFocus
                          {...register("email")}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmitting || addEmailMutation.isPending}
                      >
                        {addEmailMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowAddForm(false);
                          reset();
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {errors.email && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.email.message}
                      </p>
                    )}
                    {addEmailMutation.error && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {addEmailMutation.error instanceof Error
                          ? addEmailMutation.error.message
                          : "Failed to add email"}
                      </p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-sm">
                    <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">
                      A verification email will be sent to confirm ownership.
                      The email won&apos;t be active until verified.
                    </p>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add email address
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Email Row Component
interface EmailRowProps {
  email: UserEmail;
  onSetPrimary: () => void;
  onRemove: () => void;
  onResendVerification: () => void;
  isSettingPrimary: boolean;
  isDeleting: boolean;
  isResending: boolean;
}

function EmailRow({
  email,
  onSetPrimary,
  onRemove,
  onResendVerification,
  isSettingPrimary,
  isDeleting,
  isResending,
}: EmailRowProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              email.isPrimary
                ? "bg-primary/10"
                : email.isVerified
                ? "bg-green-500/10"
                : "bg-yellow-500/10"
            }`}
          >
            {email.isPrimary ? (
              <Star className="h-5 w-5 text-primary fill-primary" />
            ) : email.isVerified ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Clock className="h-5 w-5 text-yellow-500" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{email.email}</span>
              {email.isPrimary && (
                <Badge variant="secondary" className="flex-shrink-0">
                  Primary
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {email.isVerified ? (
                email.verifiedAt ? (
                  <>Verified on {new Date(email.verifiedAt).toLocaleDateString()}</>
                ) : (
                  "Verified"
                )
              ) : (
                <span className="text-yellow-600">Awaiting verification</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Resend Verification */}
          {!email.isVerified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResendVerification}
              disabled={isResending}
              className="gap-1"
            >
              {isResending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Resend</span>
            </Button>
          )}

          {/* Set Primary */}
          {!email.isPrimary && email.isVerified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSetPrimary}
              disabled={isSettingPrimary}
              className="gap-1"
            >
              {isSettingPrimary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Make primary</span>
            </Button>
          )}

          {/* Remove */}
          {!email.isPrimary && (
            <>
              {showConfirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      onRemove();
                      setShowConfirmDelete(false);
                    }}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirm"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConfirmDelete(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
