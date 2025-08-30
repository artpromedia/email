import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  Crown,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  Users2,
  Calendar,
} from "lucide-react";
import {
  useUser,
  useUserGroups,
  userDetailAPI,
  type UserGroup,
} from "../../data/users-detail";
import { useAdminToast } from "../../hooks/useAdminToast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GroupsTabProps {
  userId: string;
  className?: string;
}

const addToGroupSchema = z.object({
  groupId: z.string().min(1, "Please select a group"),
});

type AddToGroupFormData = z.infer<typeof addToGroupSchema>;

// Mock available groups (in real app, this would come from an API)
const availableGroups = [
  {
    id: "3",
    name: "Marketing Team",
    description: "Marketing and communications team",
  },
  { id: "4", name: "Sales Team", description: "Sales and customer relations" },
  { id: "5", name: "Finance", description: "Finance and accounting team" },
  { id: "6", name: "HR", description: "Human resources team" },
  {
    id: "7",
    name: "Engineering",
    description: "Development and engineering team",
  },
  { id: "8", name: "Operations", description: "Operations and infrastructure" },
  { id: "9", name: "Legal", description: "Legal and compliance team" },
  {
    id: "10",
    name: "Customer Success",
    description: "Customer success and support",
  },
];

function getGroupIcon(groupName: string) {
  const name = groupName.toLowerCase();
  if (name.includes("admin")) {
    return <Shield className="w-4 h-4" />;
  }
  if (name.includes("support") || name.includes("help")) {
    return <Users className="w-4 h-4" />;
  }
  return <Users2 className="w-4 h-4" />;
}

function GroupCard({
  group,
  onRemove,
  canRemove,
}: {
  group: UserGroup;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getGroupIcon(group.name)}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{group.name}</p>
                {group.isPrimary && (
                  <Badge variant="default" className="text-xs">
                    <Crown className="w-3 h-3 mr-1" />
                    Primary
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
              <p className="text-xs text-muted-foreground">
                Member since {new Date(group.memberSince).toLocaleDateString()}
              </p>
            </div>
          </div>
          {canRemove && (
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
                  Remove from Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddToGroupDialog({
  userId,
  currentGroups,
  onClose,
}: {
  userId: string;
  currentGroups: UserGroup[];
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const toast = useAdminToast();

  const form = useForm<AddToGroupFormData>({
    resolver: zodResolver(addToGroupSchema),
    defaultValues: {
      groupId: "",
    },
  });

  const { handleSubmit, formState, setValue, watch, reset } = form;
  const { isSubmitting } = formState;

  // Filter out groups the user is already a member of
  const currentGroupIds = currentGroups.map((g) => g.id);
  const filteredGroups = availableGroups
    .filter((group) => !currentGroupIds.includes(group.id))
    .filter(
      (group) =>
        searchTerm === "" ||
        group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.description.toLowerCase().includes(searchTerm.toLowerCase()),
    );

  const onSubmit = async (data: AddToGroupFormData) => {
    try {
      await userDetailAPI.addToGroup(userId, data.groupId);
      toast.success("User added to group successfully");

      reset();
      setIsOpen(false);
      setSearchTerm("");
      onClose();
    } catch (error) {
      toast.error("Failed to add user to group: " + (error as Error).message);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm("");
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add to Group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add User to Group</DialogTitle>
          <DialogDescription>
            Select a group to add this user to. The user will inherit the
            group's permissions and access rights.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Search Groups</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search for groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available Groups</Label>
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No groups available</p>
                <p className="text-sm">
                  {currentGroupIds.length === availableGroups.length
                    ? "User is already a member of all groups"
                    : "No groups match your search"}
                </p>
              </div>
            ) : (
              <Select
                value={watch("groupId")}
                onValueChange={(value) => setValue("groupId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {filteredGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div className="flex items-center gap-2">
                        {getGroupIcon(group.name)}
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.description}
                          </p>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Alert>
            <Users className="h-4 w-4" />
            <AlertTitle>Group Membership</AlertTitle>
            <AlertDescription>
              Adding the user to a group will immediately grant them the group's
              permissions and access rights. This change takes effect
              immediately.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || !watch("groupId") || filteredGroups.length === 0
              }
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Adding...
                </>
              ) : (
                "Add to Group"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsTab({ userId, className }: GroupsTabProps) {
  const toast = useAdminToast();
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useUser(userId);
  const {
    data: groups,
    isLoading: groupsLoading,
    refetch: refetchGroups,
  } = useUserGroups(userId);

  const handleRemoveFromGroup = async (groupId: string, groupName: string) => {
    if (
      window.confirm(
        `Are you sure you want to remove the user from the "${groupName}" group? This will revoke their group-based permissions.`,
      )
    ) {
      try {
        await userDetailAPI.removeFromGroup(userId, groupId);
        toast.success("User removed from group successfully");
        refetchGroups();
      } catch (error) {
        toast.error(
          "Failed to remove user from group: " + (error as Error).message,
        );
      }
    }
  };

  if (userLoading || groupsLoading) {
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
            Failed to load user group details: {(userError as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const primaryGroups = groups?.filter((group) => group.isPrimary) || [];
  const secondaryGroups = groups?.filter((group) => !group.isPrimary) || [];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Groups Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users2 className="w-5 h-5" />
            Group Membership Overview
          </CardTitle>
          <CardDescription>
            Groups define user permissions and access rights across the system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{groups?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Total Groups</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{primaryGroups.length}</div>
              <div className="text-sm text-muted-foreground">
                Primary Groups
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{secondaryGroups.length}</div>
              <div className="text-sm text-muted-foreground">
                Secondary Groups
              </div>
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Permission Inheritance</AlertTitle>
            <AlertDescription>
              User permissions are inherited from all group memberships. Primary
              groups typically define the user's main role, while secondary
              groups provide additional access rights.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Primary Groups */}
      {primaryGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              Primary Groups
            </CardTitle>
            <CardDescription>
              Primary role-defining groups that determine the user's main access
              level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {primaryGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onRemove={() => handleRemoveFromGroup(group.id, group.name)}
                  canRemove={false} // Primary groups typically cannot be removed directly
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Secondary Groups
              <Badge variant="outline">{secondaryGroups.length}</Badge>
            </div>
            <AddToGroupDialog
              userId={userId}
              currentGroups={groups || []}
              onClose={() => refetchGroups()}
            />
          </CardTitle>
          <CardDescription>
            Additional groups that provide specific permissions and access
            rights
          </CardDescription>
        </CardHeader>
        <CardContent>
          {secondaryGroups.length > 0 ? (
            <div className="space-y-3">
              {secondaryGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onRemove={() => handleRemoveFromGroup(group.id, group.name)}
                  canRemove={true}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No secondary groups</p>
              <p className="text-sm">
                User is not a member of any additional groups
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Group Permissions Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Effective Permissions
          </CardTitle>
          <CardDescription>
            Summary of permissions inherited from all group memberships
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Administrative Access</h4>
              <div className="space-y-1">
                {primaryGroups.some((g) =>
                  g.name.toLowerCase().includes("admin"),
                ) ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Full administrative access</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Limited administrative access</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Support Access</h4>
              <div className="space-y-1">
                {groups?.some((g) =>
                  g.name.toLowerCase().includes("support"),
                ) ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Support system access</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>No support access</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Team Collaboration</h4>
              <div className="space-y-1">
                {secondaryGroups.length > 0 ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Access to {secondaryGroups.length} team(s)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>No team collaboration access</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Special Permissions</h4>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Standard user permissions</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Group History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Group Membership History
          </CardTitle>
          <CardDescription>
            Timeline of group membership changes for this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {groups && groups.length > 0 ? (
              groups
                .sort(
                  (a, b) =>
                    new Date(b.memberSince).getTime() -
                    new Date(a.memberSince).getTime(),
                )
                .map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getGroupIcon(group.name)}
                      <div>
                        <p className="font-medium">{group.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Added on{" "}
                          {new Date(group.memberSince).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={group.isPrimary ? "default" : "secondary"}>
                      {group.isPrimary ? "Primary" : "Secondary"}
                    </Badge>
                  </div>
                ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No group membership history</p>
                <p className="text-sm">
                  This user has not been added to any groups yet
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
