import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Info, Save } from "lucide-react";
import {
  useUser,
  useUpdateUser,
  type UserDetail,
} from "../../data/users-detail";
import { useAdminToast } from "../../hooks/useAdminToast";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const profileFormSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name too long"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name too long"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "user", "support"], {
    required_error: "Role is required",
  }),
  status: z.enum(["active", "suspended", "pending"], {
    required_error: "Status is required",
  }),
  enabled: z.boolean(),
  timezone: z.string().min(1, "Timezone is required"),
  locale: z.string().min(1, "Locale is required"),
  quotaLimit: z.number().min(0, "Quota limit must be positive"),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

interface ProfileTabProps {
  userId: string;
  className?: string;
}

const timezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
];

const locales = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
  { value: "it-IT", label: "Italian" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
];

const roleDescriptions = {
  admin: "Full system access, can manage all users and settings",
  user: "Standard user access with basic email functionality",
  support: "Support access with limited administrative capabilities",
};

const statusDescriptions = {
  active: "User can log in and access all features normally",
  suspended: "User access is temporarily restricted",
  pending: "User account is awaiting activation or verification",
};

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatGBToBytes(gb: number): number {
  return gb * 1024 * 1024 * 1024;
}

function formatBytesToGB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10;
}

export function ProfileTab({ userId, className }: ProfileTabProps) {
  const toast = useAdminToast();
  const { data: user, isLoading, error } = useUser(userId);
  const updateUserMutation = useUpdateUser();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      role: "user",
      status: "active",
      enabled: true,
      timezone: "America/New_York",
      locale: "en-US",
      quotaLimit: 10,
    },
  });

  const { register, handleSubmit, formState, setValue, watch, reset } = form;
  const { errors, isDirty, isSubmitting } = formState;

  // Reset form when user data changes
  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        enabled: user.enabled,
        timezone: user.timezone,
        locale: user.locale,
        quotaLimit: formatBytesToGB(user.quotaLimit),
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateUserMutation.mutateAsync({
        userId,
        data: {
          ...data,
          quotaLimit: formatGBToBytes(data.quotaLimit),
          updatedAt: new Date().toISOString(),
        },
      });

      // Reset the form's dirty state
      reset(data);
    } catch (error) {
      // Error is handled by the mutation hook
      console.error("Failed to update user:", error);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load user details: {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>User Not Found</AlertTitle>
          <AlertDescription>
            The requested user could not be found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const quotaUsagePercent = Math.round(
    (user.quotaUsed / user.quotaLimit) * 100,
  );

  return (
    <div className={cn("space-y-6", className)}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Core user details and identification information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  {...register("firstName")}
                  className={errors.firstName ? "border-destructive" : ""}
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  {...register("lastName")}
                  className={errors.lastName ? "border-destructive" : ""}
                />
                {errors.lastName && (
                  <p className="text-sm text-destructive">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Primary Email Address</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                This will be the primary email address for the user account
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>
              User role, status, and access control settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={watch("role")}
                  onValueChange={(value: "admin" | "user" | "support") =>
                    setValue("role", value, { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {roleDescriptions[watch("role")]}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={watch("status")}
                  onValueChange={(value: "active" | "suspended" | "pending") =>
                    setValue("status", value, { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {statusDescriptions[watch("status")]}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enabled">Account Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, user cannot log in or access any services
                </p>
              </div>
              <Switch
                id="enabled"
                checked={watch("enabled")}
                onCheckedChange={(checked) =>
                  setValue("enabled", checked, { shouldDirty: true })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Localization */}
        <Card>
          <CardHeader>
            <CardTitle>Localization</CardTitle>
            <CardDescription>
              User preferences for timezone and language
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={watch("timezone")}
                  onValueChange={(value) =>
                    setValue("timezone", value, { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locale">Language</Label>
                <Select
                  value={watch("locale")}
                  onValueChange={(value) =>
                    setValue("locale", value, { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((locale) => (
                      <SelectItem key={locale.value} value={locale.value}>
                        {locale.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Quota */}
        <Card>
          <CardHeader>
            <CardTitle>Storage Quota</CardTitle>
            <CardDescription>
              Current usage and storage limits for this user
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quotaLimit">Storage Limit (GB)</Label>
              <Input
                id="quotaLimit"
                type="number"
                min="0"
                step="0.1"
                {...register("quotaLimit", { valueAsNumber: true })}
                className={errors.quotaLimit ? "border-destructive" : ""}
              />
              {errors.quotaLimit && (
                <p className="text-sm text-destructive">
                  {errors.quotaLimit.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Current Usage</span>
                <span className="font-mono">
                  {formatBytes(user.quotaUsed)} / {formatBytes(user.quotaLimit)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    quotaUsagePercent > 90
                      ? "bg-destructive"
                      : quotaUsagePercent > 75
                        ? "bg-warning"
                        : "bg-primary",
                  )}
                  style={{ width: `${Math.min(quotaUsagePercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>{quotaUsagePercent}% used</span>
                <span>100%</span>
              </div>
            </div>

            {quotaUsagePercent > 90 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Storage Almost Full</AlertTitle>
                <AlertDescription>
                  This user is using {quotaUsagePercent}% of their storage
                  quota. Consider increasing the limit.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Account Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Read-only account metadata and timestamps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Account Created</Label>
                <p className="font-mono">
                  {new Date(user.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Updated</Label>
                <p className="font-mono">
                  {new Date(user.updatedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Login</Label>
                <p className="font-mono">
                  {user.lastLogin
                    ? new Date(user.lastLogin).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Active</Label>
                <p className="font-mono">
                  {user.lastActive
                    ? new Date(user.lastActive).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">
                Multi-Factor Authentication
              </Label>
              <Badge variant={user.mfaEnabled ? "default" : "secondary"}>
                {user.mfaEnabled ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Enabled
                  </>
                ) : (
                  "Disabled"
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {isDirty && "You have unsaved changes"}
          </div>
          <Button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
