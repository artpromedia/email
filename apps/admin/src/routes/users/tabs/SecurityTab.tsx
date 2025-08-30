import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  Key,
  Laptop,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
  ExternalLink,
  Calendar,
  Globe,
  LogOut,
  UserX,
  UserCheck,
  Wifi,
  MapPin,
  Monitor,
  Clock,
} from "lucide-react";
import {
  useUser,
  useUserPasskeys,
  useUserOIDCIdentities,
  useUserSessions,
  useRemovePasskey,
  useUnlinkOIDCIdentity,
  useResetPassword,
  useRevokeAllSessions,
  useDisableUser,
  useEnableUser,
  useTerminateSpecificSession,
  type UserPasskey,
  type UserOIDCIdentity,
  type UserSession,
} from "../../data/users-detail";
import { useAdminToast } from "../../hooks/useAdminToast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SecurityTabProps {
  userId: string;
  className?: string;
}

// Form schemas
const resetPasswordSchema = z.object({
  reason: z.string().optional(),
});

const revokeAllSessionsSchema = z.object({
  reason: z.string().min(1, "Reason is required for revoking all sessions"),
});

const disableUserSchema = z.object({
  reason: z.string().min(1, "Reason is required for disabling user"),
});

const enableUserSchema = z.object({
  reason: z.string().optional(),
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
type RevokeAllSessionsFormData = z.infer<typeof revokeAllSessionsSchema>;
type DisableUserFormData = z.infer<typeof disableUserSchema>;
type EnableUserFormData = z.infer<typeof enableUserSchema>;

// Mock current admin user ID (in real app, this would come from auth context)
const CURRENT_ADMIN_ID = "admin_123";

function getDeviceIcon(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) {
    return <Smartphone className="w-4 h-4" />;
  }
  if (ua.includes("android")) {
    return <Smartphone className="w-4 h-4" />;
  }
  return <Monitor className="w-4 h-4" />;
}

function getProviderIcon(provider: string) {
  switch (provider.toLowerCase()) {
    case "google":
      return <Globe className="w-4 h-4" />;
    case "microsoft":
      return <Globe className="w-4 h-4" />;
    case "github":
      return <Globe className="w-4 h-4" />;
    default:
      return <Globe className="w-4 h-4" />;
  }
}

function formatUserAgent(userAgent: string): string {
  if (userAgent.includes('Chrome')) {
    return userAgent.includes('Mobile') ? 'Chrome Mobile' : 'Chrome Desktop';
  }
  if (userAgent.includes('Firefox')) {
    return userAgent.includes('Mobile') ? 'Firefox Mobile' : 'Firefox Desktop';
  }
  if (userAgent.includes('Safari')) {
    if (userAgent.includes('iPhone')) return 'Safari iPhone';
    if (userAgent.includes('iPad')) return 'Safari iPad';
    return 'Safari Desktop';
  }
  if (userAgent.includes('Edge')) {
    return 'Microsoft Edge';
  }
  return 'Unknown Browser';
}

function PasskeyCard({
  passkey,
  onRemove,
}: {
  passkey: UserPasskey;
  onRemove: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getDeviceIcon(passkey.credentialId)}
            <div>
              <p className="font-medium">{passkey.name}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Added {new Date(passkey.createdAt).toLocaleDateString()}
                </span>
                {passkey.lastUsed && (
                  <span>
                    Last used {new Date(passkey.lastUsed).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRemove} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Passkey
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function OIDCIdentityCard({
  identity,
  onUnlink,
}: {
  identity: UserOIDCIdentity;
  onUnlink: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getProviderIcon(identity.provider)}
            <div>
              <p className="font-medium capitalize">{identity.provider}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{identity.email}</span>
                {identity.lastUsed && (
                  <span>
                    Last used {new Date(identity.lastUsed).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onUnlink} className="text-destructive">
                <ExternalLink className="w-4 h-4 mr-2" />
                Unlink Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function DeviceSessionCard({ 
  session, 
  onTerminate,
  disabled 
}: { 
  session: UserSession; 
  onTerminate: () => void;
  disabled: boolean;
}) {
  return (
    <Card className={cn(
      "transition-all duration-200",
      session.isCurrent && "ring-2 ring-primary/20 bg-primary/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getDeviceIcon(session.userAgent)}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{formatUserAgent(session.userAgent)}</p>
                {session.isCurrent && (
                  <Badge variant="default" className="text-xs">
                    Current Session
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  <span>{session.ipAddress}</span>
                </div>
                {session.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{session.location}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>First seen: {new Date(session.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Last seen: {new Date(session.lastActive).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
          {!session.isCurrent && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTerminate}
              disabled={disabled}
              className="text-destructive hover:text-destructive"
            >
              {disabled ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <LogOut className="w-4 h-4 mr-2" />
              )}
              Revoke
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResetPasswordDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [resetResult, setResetResult] = useState<{
    resetToken: string;
    resetLink: string;
    expiresAt: string;
  } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const resetPasswordMutation = useResetPassword();

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { isSubmitting } = formState;

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      const result = await resetPasswordMutation.mutateAsync({
        userId,
        reason: data.reason,
        actorId: CURRENT_ADMIN_ID,
      });
      setResetResult(result);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleCopyToken = () => {
    if (resetResult) {
      navigator.clipboard.writeText(resetResult.resetToken);
    }
  };

  const handleCopyLink = () => {
    if (resetResult) {
      navigator.clipboard.writeText(resetResult.resetLink);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResetResult(null);
    setShowToken(false);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Key className="w-4 h-4 mr-2" />
          Reset Password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset User Password</DialogTitle>
          <DialogDescription>
            Generate a secure reset link that the user can use to set a new password.
          </DialogDescription>
        </DialogHeader>

        {resetResult ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Reset Link Generated</AlertTitle>
              <AlertDescription>
                A secure password reset link has been generated with a 24-hour expiration.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reset Token</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded border font-mono text-sm">
                    {showToken ? resetResult.resetToken : "•".repeat(20)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToken}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Reset Link</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded border font-mono text-sm truncate">
                    {resetResult.resetLink}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <strong>Expires:</strong> {new Date(resetResult.expiresAt).toLocaleString()}
              </div>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Notice</AlertTitle>
              <AlertDescription>
                This link will only be shown once. Share it securely with the user through a trusted channel.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Why are you resetting this user's password?"
                {...register("reason")}
                rows={3}
              />
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Security Impact</AlertTitle>
              <AlertDescription>
                This will generate a one-time reset link. The user's current password remains valid until they use the reset link.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                variant="destructive"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Generating...
                  </>
                ) : (
                  "Generate Reset Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {resetResult && (
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeAllSessionsDialog({
  userId,
  sessionCount,
  onClose,
}: {
  userId: string;
  sessionCount: number;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const revokeAllSessionsMutation = useRevokeAllSessions();

  const form = useForm<RevokeAllSessionsFormData>({
    resolver: zodResolver(revokeAllSessionsSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isSubmitting } = formState;

  const onSubmit = async (data: RevokeAllSessionsFormData) => {
    try {
      await revokeAllSessionsMutation.mutateAsync({
        userId,
        reason: data.reason,
        actorId: CURRENT_ADMIN_ID,
      });
      handleClose();
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Revoke All Sessions ({sessionCount})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke All Sessions</DialogTitle>
          <DialogDescription>
            This will immediately log out the user from all devices and sessions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Why are you revoking all sessions? (Required)"
              {...register("reason")}
              className={errors.reason ? "border-destructive" : ""}
              rows={3}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason.message}</p>
            )}
          </div>

          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Critical Security Action</AlertTitle>
            <AlertDescription>
              This will revoke all {sessionCount} active session(s). The user will be immediately logged out from all devices and will need to log in again.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Revoking...
                </>
              ) : (
                `Revoke All ${sessionCount} Sessions`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisableUserDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const disableUserMutation = useDisableUser();

  const form = useForm<DisableUserFormData>({
    resolver: zodResolver(disableUserSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isSubmitting } = formState;

  const onSubmit = async (data: DisableUserFormData) => {
    try {
      await disableUserMutation.mutateAsync({
        userId,
        reason: data.reason,
        actorId: CURRENT_ADMIN_ID,
      });
      handleClose();
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <UserX className="w-4 h-4 mr-2" />
          Disable User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable User Account</DialogTitle>
          <DialogDescription>
            This will disable the user account and revoke all active sessions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Why are you disabling this user account? (Required)"
              {...register("reason")}
              className={errors.reason ? "border-destructive" : ""}
              rows={3}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason.message}</p>
            )}
          </div>

          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Critical Account Action</AlertTitle>
            <AlertDescription>
              Disabling <strong>{userName}</strong> will:
              <ul className="mt-2 list-disc list-inside">
                <li>Prevent all future logins</li>
                <li>Revoke all active sessions</li>
                <li>Set account status to "suspended"</li>
                <li>Require re-enabling to restore access</li>
              </ul>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Disabling...
                </>
              ) : (
                "Disable User Account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EnableUserDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const enableUserMutation = useEnableUser();

  const form = useForm<EnableUserFormData>({
    resolver: zodResolver(enableUserSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { isSubmitting } = formState;

  const onSubmit = async (data: EnableUserFormData) => {
    try {
      await enableUserMutation.mutateAsync({
        userId,
        reason: data.reason,
        actorId: CURRENT_ADMIN_ID,
      });
      handleClose();
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <UserCheck className="w-4 h-4 mr-2" />
          Enable User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable User Account</DialogTitle>
          <DialogDescription>
            This will re-enable the user account and allow them to log in again.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Why are you enabling this user account?"
              {...register("reason")}
              rows={3}
            />
          </div>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Account Restoration</AlertTitle>
            <AlertDescription>
              Enabling <strong>{userName}</strong> will:
              <ul className="mt-2 list-disc list-inside">
                <li>Allow the user to log in again</li>
                <li>Set account status to "active"</li>
                <li>Restore normal account functionality</li>
              </ul>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="default"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Enabling...
                </>
              ) : (
                "Enable User Account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      generatePassword: true,
      sendEmail: true,
    },
  });

  const { watch } = form;

  const handleResetPassword = async () => {
    setIsSubmitting(true);
    try {
      const result = await userDetailAPI.resetPassword(userId);
      setTemporaryPassword(result.temporaryPassword);
      toast.success("Password reset successfully");
    } catch (error) {
      toast.error("Failed to reset password: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPassword = () => {
    if (temporaryPassword) {
      navigator.clipboard.writeText(temporaryPassword);
      toast.success("Password copied to clipboard");
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTemporaryPassword(null);
    setShowPassword(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Key className="w-4 h-4 mr-2" />
          Reset Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset User Password</DialogTitle>
          <DialogDescription>
            This will generate a new temporary password for the user. They will
            be required to change it on their next login.
          </DialogDescription>
        </DialogHeader>

        {temporaryPassword ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Password Reset Successfully</AlertTitle>
              <AlertDescription>
                A new temporary password has been generated. Make sure to
                securely share this with the user.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary Password</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded border font-mono text-sm">
                  {showPassword
                    ? temporaryPassword
                    : "•".repeat(temporaryPassword.length)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPassword}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Security Notice</AlertTitle>
              <AlertDescription>
                This password will only be shown once. Make sure to save it
                securely and share it with the user through a secure channel.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Generate new password
                </label>
                <input
                  type="checkbox"
                  checked={watch("generatePassword")}
                  onChange={(e) =>
                    form.setValue("generatePassword", e.target.checked)
                  }
                  className="rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Send email notification
                </label>
                <input
                  type="checkbox"
                  checked={watch("sendEmail")}
                  onChange={(e) => form.setValue("sendEmail", e.target.checked)}
                  className="rounded"
                />
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Security Impact</AlertTitle>
              <AlertDescription>
                Resetting the password will immediately invalidate all existing
                sessions and require the user to log in again with the new
                password.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {temporaryPassword ? "Close" : "Cancel"}
          </Button>
          {!temporaryPassword && (
            <Button
              onClick={handleResetPassword}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SecurityTab({ userId, className }: SecurityTabProps) {
  const toast = useAdminToast();
  const { data: user, isLoading: userLoading, error: userError } = useUser(userId);
  const { data: passkeys, isLoading: passkeysLoading } = useUserPasskeys(userId);
  const { data: oidcIdentities, isLoading: oidcLoading } = useUserOIDCIdentities(userId);
  const { data: sessions, isLoading: sessionsLoading } = useUserSessions(userId);
  
  const removePasskeyMutation = useRemovePasskey();
  const unlinkOIDCMutation = useUnlinkOIDCIdentity();
  const terminateSessionMutation = useTerminateSpecificSession();

  const handleRemovePasskey = (passkeyId: string, passkeyName: string) => {
    if (window.confirm(`Are you sure you want to remove the passkey "${passkeyName}"? This action cannot be undone.`)) {
      removePasskeyMutation.mutate({ userId, passkeyId });
    }
  };

  const handleUnlinkOIDC = (identityId: string, provider: string) => {
    if (window.confirm(`Are you sure you want to unlink the ${provider} account? The user will no longer be able to sign in using this provider.`)) {
      unlinkOIDCMutation.mutate({ userId, identityId });
    }
  };

  const handleTerminateSession = (sessionId: string) => {
    terminateSessionMutation.mutate({ 
      userId, 
      sessionId, 
      actorId: CURRENT_ADMIN_ID 
    });
  };

  if (userLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (userError) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load user security details: {(userError as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const activeSessions = sessions?.filter(s => s.isCurrent) || [];
  const inactiveSessions = sessions?.filter(s => !s.isCurrent) || [];
  const allSessions = sessions || [];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Security Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Security Overview
          </CardTitle>
          <CardDescription>
            Current security status and quick actions for this user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span className="font-medium">Account Status</span>
              </div>
              <Badge variant={user.enabled ? "default" : "destructive"}>
                {user.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                <span className="font-medium">Multi-Factor Auth</span>
              </div>
              <Badge variant={user.mfaEnabled ? "default" : "secondary"}>
                {user.mfaEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                <span className="font-medium">Active Sessions</span>
              </div>
              <Badge variant="outline">
                {activeSessions.length}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                <span className="font-medium">Passkeys</span>
              </div>
              <Badge variant="outline">
                {passkeys?.length || 0}
              </Badge>
            </div>
          </div>

          {!user.enabled && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Account Disabled</AlertTitle>
              <AlertDescription>
                This user account is currently disabled and cannot be used to log in.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Critical Security Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Critical Security Actions</CardTitle>
          <CardDescription>
            High-impact security operations that require careful consideration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Password Management</h4>
              <ResetPasswordDialog userId={userId} onClose={() => {}} />
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Session Management</h4>
              {allSessions.length > 0 ? (
                <RevokeAllSessionsDialog 
                  userId={userId} 
                  sessionCount={allSessions.length}
                  onClose={() => {}} 
                />
              ) : (
                <Button variant="outline" disabled>
                  <LogOut className="w-4 h-4 mr-2" />
                  No Active Sessions
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Account Control</h4>
              {user.enabled ? (
                <DisableUserDialog 
                  userId={userId} 
                  userName={user.name}
                  onClose={() => {}} 
                />
              ) : (
                <EnableUserDialog 
                  userId={userId} 
                  userName={user.name}
                  onClose={() => {}} 
                />
              )}
            </div>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Security Warning</AlertTitle>
            <AlertDescription>
              All security actions are logged and audited. Ensure you have proper authorization before performing these operations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Device Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Device Sessions
              <Badge variant="outline">{allSessions.length}</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Active and recent device sessions with detailed information
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : allSessions.length > 0 ? (
            <div className="space-y-3">
              {allSessions
                .sort((a, b) => b.lastActive.localeCompare(a.lastActive))
                .map((session) => (
                  <DeviceSessionCard
                    key={session.id}
                    session={session}
                    onTerminate={() => handleTerminateSession(session.id)}
                    disabled={terminateSessionMutation.isPending}
                  />
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active sessions</p>
              <p className="text-sm">User is not currently logged in from any device</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Management */}
      <Card>
        <CardHeader>
          <CardTitle>Password Management</CardTitle>
          <CardDescription>
            Manage user password and authentication credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Password Security</p>
              <p className="text-sm text-muted-foreground">
                Reset the user's password and force them to create a new one
              </p>
            </div>
            <ResetPasswordDialog userId={userId} onClose={() => {}} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <p className="font-medium">Last Password Change</p>
              <p className="text-sm text-muted-foreground">
                {user.updatedAt
                  ? new Date(user.updatedAt).toLocaleDateString()
                  : "Unknown"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Passkeys
            </div>
            <Badge variant="outline">{passkeys?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>
            Hardware security keys and biometric authentication methods
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passkeysLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : passkeys && passkeys.length > 0 ? (
            <div className="space-y-3">
              {passkeys.map((passkey) => (
                <PasskeyCard
                  key={passkey.id}
                  passkey={passkey}
                  onRemove={() => handleRemovePasskey(passkey.id, passkey.name)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No passkeys registered</p>
              <p className="text-sm">
                User hasn't set up any hardware security keys or biometric
                authentication
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OIDC Identities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Social Login Accounts
            </div>
            <Badge variant="outline">{oidcIdentities?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>
            Connected social media and identity provider accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {oidcLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : oidcIdentities && oidcIdentities.length > 0 ? (
            <div className="space-y-3">
              {oidcIdentities.map((identity) => (
                <OIDCIdentityCard
                  key={identity.id}
                  identity={identity}
                  onUnlink={() =>
                    handleUnlinkOIDC(identity.id, identity.provider)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No social accounts connected</p>
              <p className="text-sm">
                User hasn't linked any social media or identity provider
                accounts
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Recent Security Events
          </CardTitle>
          <CardDescription>
            Important security-related activities for this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {user.lastLogin && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Last successful login</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(user.lastLogin).toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>Account created</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {new Date(user.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-600" />
                <span>Profile last updated</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {new Date(user.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
