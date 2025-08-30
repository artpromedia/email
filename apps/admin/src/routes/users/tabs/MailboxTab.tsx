import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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
  Forward,
  HardDrive,
  Mail,
  MailForward,
  Plus,
  Save,
  Shield,
  ShieldAlert,
  Trash2,
  MoreHorizontal,
  Calendar,
  Clock,
} from "lucide-react";
import {
  useUser,
  useUserMailbox,
  useUserAliases,
  useAddAlias,
  useRemoveAlias,
  userDetailAPI,
  type UserAlias,
  type UserMailbox,
} from "../../data/users-detail";
import { useAdminToast } from "../../hooks/useAdminToast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MailboxTabProps {
  userId: string;
  className?: string;
}

const mailboxFormSchema = z
  .object({
    quotaLimit: z.number().min(0, "Quota limit must be positive"),
    forwardingEnabled: z.boolean(),
    forwardingTarget: z.string().optional(),
    retentionDays: z
      .number()
      .min(1, "Retention must be at least 1 day")
      .max(3650, "Retention cannot exceed 10 years"),
    legalHoldEnabled: z.boolean(),
  })
  .refine(
    (data) => {
      if (
        data.forwardingEnabled &&
        (!data.forwardingTarget || data.forwardingTarget.trim() === "")
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Forwarding target is required when forwarding is enabled",
      path: ["forwardingTarget"],
    },
  );

const addAliasSchema = z.object({
  address: z.string().email("Invalid email address"),
});

type MailboxFormData = z.infer<typeof mailboxFormSchema>;
type AddAliasFormData = z.infer<typeof addAliasSchema>;

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

function AliasCard({
  alias,
  onRemove,
  isPrimary,
}: {
  alias: UserAlias;
  onRemove: () => void;
  isPrimary: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{alias.address}</p>
                {isPrimary && (
                  <Badge variant="default" className="text-xs">
                    Primary
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Added {new Date(alias.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {!isPrimary && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onRemove}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Alias
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddAliasDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toast = useAdminToast();
  const addAliasMutation = useAddAlias();

  const form = useForm<AddAliasFormData>({
    resolver: zodResolver(addAliasSchema),
    defaultValues: {
      address: "",
    },
  });

  const { register, handleSubmit, formState, reset } = form;
  const { errors, isSubmitting } = formState;

  const onSubmit = async (data: AddAliasFormData) => {
    try {
      await addAliasMutation.mutateAsync({
        userId,
        address: data.address,
      });

      reset();
      setIsOpen(false);
      onClose();
    } catch (error) {
      // Error is handled by the mutation hook
      console.error("Failed to add alias:", error);
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
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Alias
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Email Alias</DialogTitle>
          <DialogDescription>
            Create a new email alias for this user. All emails sent to this
            alias will be delivered to their primary inbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Email Address</Label>
            <Input
              id="address"
              type="email"
              placeholder="alias@ceerion.com"
              {...register("address")}
              className={errors.address ? "border-destructive" : ""}
            />
            {errors.address && (
              <p className="text-sm text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertTitle>Alias Information</AlertTitle>
            <AlertDescription>
              The new alias will be immediately available for receiving emails.
              Make sure the domain is properly configured in your DNS settings.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Adding...
                </>
              ) : (
                "Add Alias"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MailboxTab({ userId, className }: MailboxTabProps) {
  const toast = useAdminToast();
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useUser(userId);
  const { data: mailbox, isLoading: mailboxLoading } = useUserMailbox(userId);
  const { data: aliases, isLoading: aliasesLoading } = useUserAliases(userId);
  const removeAliasMutation = useRemoveAlias();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<MailboxFormData>({
    resolver: zodResolver(mailboxFormSchema),
    defaultValues: {
      quotaLimit: 10,
      forwardingEnabled: false,
      forwardingTarget: "",
      retentionDays: 365,
      legalHoldEnabled: false,
    },
  });

  const { register, handleSubmit, formState, setValue, watch, reset } = form;
  const { errors, isDirty } = formState;

  // Reset form when mailbox data changes
  useEffect(() => {
    if (mailbox) {
      reset({
        quotaLimit: formatBytesToGB(mailbox.quotaLimit),
        forwardingEnabled: mailbox.forwardingEnabled,
        forwardingTarget: mailbox.forwardingTarget || "",
        retentionDays: mailbox.retentionDays,
        legalHoldEnabled: mailbox.legalHoldEnabled,
      });
    }
  }, [mailbox, reset]);

  const onSubmit = async (data: MailboxFormData) => {
    setIsSubmitting(true);
    try {
      await userDetailAPI.updateMailbox(userId, {
        ...data,
        quotaLimit: formatGBToBytes(data.quotaLimit),
        forwardingTarget: data.forwardingEnabled
          ? data.forwardingTarget
          : undefined,
      });

      toast.success("Mailbox settings updated successfully");
      reset(data);
    } catch (error) {
      toast.error(
        "Failed to update mailbox settings: " + (error as Error).message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAlias = (aliasId: string, address: string) => {
    if (
      window.confirm(
        `Are you sure you want to remove the alias "${address}"? This action cannot be undone.`,
      )
    ) {
      removeAliasMutation.mutate({ userId, aliasId });
    }
  };

  if (userLoading || mailboxLoading) {
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
            Failed to load mailbox details: {(userError as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user || !mailbox) {
    return null;
  }

  const quotaUsagePercent = Math.round(
    (mailbox.quotaUsed / mailbox.quotaLimit) * 100,
  );
  const primaryAlias = aliases?.find((alias) => alias.isPrimary);
  const secondaryAliases = aliases?.filter((alias) => !alias.isPrimary) || [];

  return (
    <div className={cn("space-y-6", className)}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Storage Usage
            </CardTitle>
            <CardDescription>
              Current mailbox storage usage and quota limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Current Usage</span>
                <span className="font-mono">
                  {formatBytes(mailbox.quotaUsed)} /{" "}
                  {formatBytes(mailbox.quotaLimit)}
                </span>
              </div>
              <Progress
                value={quotaUsagePercent}
                className={cn(
                  "h-2",
                  quotaUsagePercent > 90 && "text-destructive",
                )}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>{quotaUsagePercent}% used</span>
                <span>100%</span>
              </div>
            </div>

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

            {quotaUsagePercent > 90 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Storage Almost Full</AlertTitle>
                <AlertDescription>
                  This mailbox is using {quotaUsagePercent}% of its storage
                  quota. Consider increasing the limit or archiving old emails.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Email Forwarding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailForward className="w-5 h-5" />
              Email Forwarding
            </CardTitle>
            <CardDescription>
              Configure automatic forwarding of incoming emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="forwardingEnabled">
                  Enable Email Forwarding
                </Label>
                <p className="text-sm text-muted-foreground">
                  Forward all incoming emails to another address
                </p>
              </div>
              <Switch
                id="forwardingEnabled"
                checked={watch("forwardingEnabled")}
                onCheckedChange={(checked) =>
                  setValue("forwardingEnabled", checked, { shouldDirty: true })
                }
              />
            </div>

            {watch("forwardingEnabled") && (
              <div className="space-y-2">
                <Label htmlFor="forwardingTarget">Forward To</Label>
                <Input
                  id="forwardingTarget"
                  type="email"
                  placeholder="forward@example.com"
                  {...register("forwardingTarget")}
                  className={
                    errors.forwardingTarget ? "border-destructive" : ""
                  }
                />
                {errors.forwardingTarget && (
                  <p className="text-sm text-destructive">
                    {errors.forwardingTarget.message}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <CheckCircle
                    className={cn(
                      "w-4 h-4",
                      mailbox.forwardingVerified
                        ? "text-green-600"
                        : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      mailbox.forwardingVerified
                        ? "text-green-600"
                        : "text-muted-foreground",
                    )}
                  >
                    {mailbox.forwardingVerified
                      ? "Forwarding target verified"
                      : "Forwarding target not verified"}
                  </span>
                </div>
              </div>
            )}

            {watch("forwardingEnabled") && !mailbox.forwardingVerified && (
              <Alert>
                <Forward className="h-4 w-4" />
                <AlertTitle>Verification Required</AlertTitle>
                <AlertDescription>
                  The forwarding target must verify the forwarding request
                  before emails will be forwarded. A verification email will be
                  sent when you save these settings.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Retention Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Retention Policy
            </CardTitle>
            <CardDescription>
              Configure how long emails are kept in the mailbox
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retentionDays">Retention Period (Days)</Label>
              <Input
                id="retentionDays"
                type="number"
                min="1"
                max="3650"
                {...register("retentionDays", { valueAsNumber: true })}
                className={errors.retentionDays ? "border-destructive" : ""}
              />
              {errors.retentionDays && (
                <p className="text-sm text-destructive">
                  {errors.retentionDays.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Emails older than this will be automatically deleted. Maximum 10
                years (3650 days).
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="legalHoldEnabled">Legal Hold</Label>
                <p className="text-sm text-muted-foreground">
                  Prevent automatic deletion for legal or compliance purposes
                </p>
              </div>
              <Switch
                id="legalHoldEnabled"
                checked={watch("legalHoldEnabled")}
                onCheckedChange={(checked) =>
                  setValue("legalHoldEnabled", checked, { shouldDirty: true })
                }
              />
            </div>

            {watch("legalHoldEnabled") && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Legal Hold Active</AlertTitle>
                <AlertDescription>
                  When legal hold is enabled, emails will not be automatically
                  deleted regardless of the retention period. This should only
                  be used for legal or compliance requirements.
                </AlertDescription>
              </Alert>
            )}
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

      <Separator />

      {/* Email Aliases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Aliases
            </div>
            <AddAliasDialog userId={userId} onClose={() => {}} />
          </CardTitle>
          <CardDescription>
            Manage email aliases and alternative addresses for this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aliasesLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary Address */}
              {primaryAlias && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Primary Address</h4>
                  <AliasCard
                    alias={primaryAlias}
                    onRemove={() => {}}
                    isPrimary={true}
                  />
                </div>
              )}

              {/* Secondary Aliases */}
              {secondaryAliases.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Aliases ({secondaryAliases.length})
                  </h4>
                  <div className="space-y-2">
                    {secondaryAliases.map((alias) => (
                      <AliasCard
                        key={alias.id}
                        alias={alias}
                        onRemove={() =>
                          handleRemoveAlias(alias.id, alias.address)
                        }
                        isPrimary={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {aliases && aliases.length === 1 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No additional aliases</p>
                  <p className="text-sm">
                    Only the primary email address is configured
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
