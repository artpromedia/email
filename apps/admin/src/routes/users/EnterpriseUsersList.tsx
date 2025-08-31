import React, { useState, useMemo, useCallback, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  ShieldOff,
  Key,
  UserCheck,
  UserX,
  Download,
  Upload,
  RefreshCw,
  CheckSquare,
  Square,
  Users,
} from "lucide-react";
import {
  useUsers,
  useUsersParams,
  useToggleUserEnabled,
  useToggleUserRole,
  useResetPassword,
  useDeleteUser,
  useBulkUpdate,
  type AdminUser,
} from "../../data/users-enterprise";
import { PendingButton } from "../../components/PendingButton";
import { useConfirm } from "../../hooks/useConfirm";
import { UserListSkeleton } from "../../components/UserSkeletons";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "../../components/ui/dropdown-menu";
import { Checkbox } from "../../components/ui/checkbox";
import { useDebounce } from "../../hooks/useDebounce";

// Enterprise Toolbar Component
const UsersToolbar = React.memo(
  ({
    selectedCount,
    totalCount,
    onBulkAction,
    onRefresh,
    isRefreshing,
  }: {
    selectedCount: number;
    totalCount: number;
    onBulkAction: (action: "enable" | "disable" | "delete") => void;
    onRefresh: () => void;
    isRefreshing: boolean;
  }) => {
    const { params, updateParams } = useUsersParams();
    const [searchInput, setSearchInput] = useState(params.query || "");
    const debouncedSearch = useDebounce(searchInput, 300);

    // Update URL when debounced search changes
    React.useEffect(() => {
      updateParams({ query: debouncedSearch });
    }, [debouncedSearch, updateParams]);

    return (
      <div className="space-y-4">
        {/* Top Row: Title and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <Badge variant="secondary" className="ml-2">
              {totalCount} total
            </Badge>
            {selectedCount > 0 && (
              <Badge variant="default" className="ml-1">
                {selectedCount} selected
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>

            <Link to="/users/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Role Filter */}
          <Select
            value={params.role || ""}
            onValueChange={(value) => updateParams({ role: value as any })}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="support">Support</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={params.status || ""}
            onValueChange={(value) => updateParams({ status: value as any })}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          {/* Enabled Filter */}
          <Select
            value={
              params.enabled === true
                ? "true"
                : params.enabled === false
                  ? "false"
                  : "all"
            }
            onValueChange={(value) =>
              updateParams({ enabled: value === "all" ? "" : value === "true" })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Enabled" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Enabled</SelectItem>
              <SelectItem value="false">Disabled</SelectItem>
            </SelectContent>
          </Select>

          {/* MFA Filter */}
          <Select
            value={
              params.mfa === true
                ? "true"
                : params.mfa === false
                  ? "false"
                  : "all"
            }
            onValueChange={(value) =>
              updateParams({ mfa: value === "all" ? "" : value === "true" })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="MFA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">MFA On</SelectItem>
              <SelectItem value="false">MFA Off</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {(params.query ||
            params.role ||
            params.status ||
            params.enabled !== "" ||
            params.mfa !== "") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateParams({
                  query: "",
                  role: "",
                  status: "",
                  enabled: "",
                  mfa: "",
                })
              }
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Bulk Actions Row */}
        {selectedCount > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
            <span className="text-sm text-blue-700 font-medium">
              {selectedCount} user{selectedCount !== 1 ? "s" : ""} selected
            </span>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction("enable")}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Enable
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction("disable")}
              >
                <UserX className="h-4 w-4 mr-2" />
                Disable
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => onBulkAction("delete")}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

// Enhanced User Row Component
const UserRowActions = React.memo(
  ({
    user,
    onToggleEnabled,
    onToggleRole,
    onResetPassword,
    onDelete,
    isPending,
  }: {
    user: AdminUser;
    onToggleEnabled: (enabled: boolean) => void;
    onToggleRole: (role: "admin" | "user" | "support") => void;
    onResetPassword: () => void;
    onDelete: () => void;
    isPending: boolean;
  }) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>User Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link to={`/users/${user.id}`} className="cursor-pointer">
              <Edit className="h-4 w-4 mr-2" />
              Edit Details
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onResetPassword}>
            <Key className="h-4 w-4 mr-2" />
            Reset Password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => onToggleEnabled(!user.enabled)}>
            {user.enabled ? (
              <UserX className="h-4 w-4 mr-2" />
            ) : (
              <UserCheck className="h-4 w-4 mr-2" />
            )}
            {user.enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>

          {user.role !== "admin" && (
            <DropdownMenuItem onClick={() => onToggleRole("admin")}>
              <Shield className="h-4 w-4 mr-2" />
              Make Admin
            </DropdownMenuItem>
          )}

          {user.role === "admin" && (
            <DropdownMenuItem onClick={() => onToggleRole("user")}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Remove Admin
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={onDelete}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

const UserRow = React.memo(
  ({
    user,
    isSelected,
    onSelect,
    onToggleEnabled,
    onToggleRole,
    onResetPassword,
    onDelete,
    isPending,
  }: {
    user: AdminUser;
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    onToggleEnabled: (enabled: boolean) => void;
    onToggleRole: (role: "admin" | "user" | "support") => void;
    onResetPassword: () => void;
    onDelete: () => void;
    isPending: boolean;
  }) => {
    const formatDate = (dateString?: string) => {
      if (!dateString) return "Never";
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatQuota = (used: number, limit: number) => {
      const percentage = (used / limit) * 100;
      const usedMB = (used / 1024 / 1024).toFixed(1);
      const limitMB = (limit / 1024 / 1024).toFixed(0);

      return { percentage, display: `${usedMB}/${limitMB} MB` };
    };

    const quota = formatQuota(user.quotaUsed, user.quotaLimit);
    const isOverQuota = quota.percentage > 100;

    return (
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50 ${isPending ? "opacity-50" : ""}`}
      >
        {/* Checkbox */}
        <td className="px-4 py-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            disabled={isPending}
          />
        </td>

        {/* User Info */}
        <td className="px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600">
                  {user.firstName?.charAt(0)}
                  {user.lastName?.charAt(0)}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <Link
                to={`/users/${user.id}`}
                className="font-medium text-gray-900 hover:text-blue-600 truncate block"
              >
                {user.name}
              </Link>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        </td>

        {/* Role */}
        <td className="px-4 py-3">
          <Badge
            variant={user.role === "admin" ? "default" : "secondary"}
            className="capitalize"
          >
            {user.role}
          </Badge>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <div className="flex items-center space-x-2">
            <Badge
              variant={
                user.status === "active"
                  ? "default"
                  : user.status === "suspended"
                    ? "destructive"
                    : "secondary"
              }
              className="capitalize"
            >
              {user.status}
            </Badge>
            {!user.enabled && (
              <Badge variant="outline" className="text-red-600 border-red-200">
                Disabled
              </Badge>
            )}
          </div>
        </td>

        {/* MFA */}
        <td className="px-4 py-3">
          <Badge
            variant={user.mfaEnabled ? "default" : "secondary"}
            className={user.mfaEnabled ? "bg-green-100 text-green-700" : ""}
          >
            {user.mfaEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </td>

        {/* Quota */}
        <td className="px-4 py-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className={isOverQuota ? "text-red-600" : "text-gray-700"}>
                {quota.display}
              </span>
              <span
                className={`text-xs ${isOverQuota ? "text-red-600" : "text-gray-500"}`}
              >
                {quota.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  isOverQuota
                    ? "bg-red-500"
                    : quota.percentage > 80
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${Math.min(quota.percentage, 100)}%` }}
              />
            </div>
          </div>
        </td>

        {/* Last Active */}
        <td className="px-4 py-3 text-sm text-gray-500">
          {formatDate(user.lastActive)}
        </td>

        {/* Created */}
        <td className="px-4 py-3 text-sm text-gray-500">
          {formatDate(user.createdAt)}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <UserRowActions
            user={user}
            onToggleEnabled={onToggleEnabled}
            onToggleRole={onToggleRole}
            onResetPassword={onResetPassword}
            onDelete={onDelete}
            isPending={isPending}
          />
        </td>
      </tr>
    );
  },
);

// Main Users List Content
const UsersListContent = () => {
  const { data: usersResponse } = useUsers();
  const { params, updateParams } = useUsersParams();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [pendingUsers, setPendingUsers] = useState<Set<string>>(new Set());

  const toggleEnabled = useToggleUserEnabled();
  const toggleRole = useToggleUserRole();
  const resetPassword = useResetPassword();
  const deleteUser = useDeleteUser();
  const bulkUpdate = useBulkUpdate();
  const confirm = useConfirm();

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedUsers(new Set(usersResponse.users.map((u) => u.id)));
      } else {
        setSelectedUsers(new Set());
      }
    },
    [usersResponse.users],
  );

  const handleSelectUser = useCallback((userId: string, checked: boolean) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(userId);
      } else {
        newSet.delete(userId);
      }
      return newSet;
    });
  }, []);

  const handleUserAction = useCallback(
    async (userId: string, action: () => Promise<any>, actionName: string) => {
      setPendingUsers((prev) => new Set(prev).add(userId));
      try {
        await action();
      } finally {
        setPendingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
      }
    },
    [],
  );

  const handleBulkAction = useCallback(
    async (action: "enable" | "disable" | "delete") => {
      if (selectedUsers.size === 0) return;

      const actionText =
        action === "enable"
          ? "enable"
          : action === "disable"
            ? "disable"
            : "delete";
      const confirmed = await confirm({
        title: `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} Users`,
        description: `Are you sure you want to ${actionText} ${selectedUsers.size} selected user(s)? This action cannot be undone.`,
        confirmText: actionText.charAt(0).toUpperCase() + actionText.slice(1),
        variant: action === "delete" ? "destructive" : "default",
      });

      if (confirmed) {
        await bulkUpdate.mutateAsync({
          userIds: Array.from(selectedUsers),
          action,
        });
        setSelectedUsers(new Set());
      }
    },
    [selectedUsers, bulkUpdate, confirm],
  );

  const isAllSelected =
    selectedUsers.size === usersResponse.users.length &&
    usersResponse.users.length > 0;
  const isIndeterminate =
    selectedUsers.size > 0 && selectedUsers.size < usersResponse.users.length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <UsersToolbar
          selectedCount={selectedUsers.size}
          totalCount={usersResponse.total}
          onBulkAction={handleBulkAction}
          onRefresh={() => window.location.reload()}
          isRefreshing={false}
        />
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  MFA
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quota
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usersResponse.users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelected={selectedUsers.has(user.id)}
                  onSelect={(checked) => handleSelectUser(user.id, checked)}
                  onToggleEnabled={(enabled) =>
                    handleUserAction(
                      user.id,
                      () =>
                        toggleEnabled.mutateAsync({ userId: user.id, enabled }),
                      enabled ? "enable" : "disable",
                    )
                  }
                  onToggleRole={(role) =>
                    handleUserAction(
                      user.id,
                      () => toggleRole.mutateAsync({ userId: user.id, role }),
                      "update role",
                    )
                  }
                  onResetPassword={() =>
                    handleUserAction(
                      user.id,
                      () => resetPassword.mutateAsync(user.id),
                      "reset password",
                    )
                  }
                  onDelete={async () => {
                    const confirmed = await confirm({
                      title: "Delete User",
                      description: `Are you sure you want to delete ${user.name}? This action cannot be undone.`,
                      confirmText: "Delete",
                      variant: "destructive",
                    });

                    if (confirmed) {
                      handleUserAction(
                        user.id,
                        () => deleteUser.mutateAsync(user.id),
                        "delete",
                      );
                    }
                  }}
                  isPending={pendingUsers.has(user.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {usersResponse.hasNextPage && (
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Showing {usersResponse.users.length} of {usersResponse.total}{" "}
                users
              </p>

              <div className="flex items-center space-x-2">
                {params.page > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ page: params.page - 1 })}
                  >
                    Previous
                  </Button>
                )}

                {usersResponse.hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ page: params.page + 1 })}
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Main component with Suspense
export const EnterpriseUsersList = () => {
  return (
    <div className="p-6 space-y-6">
      <Suspense fallback={<UserListSkeleton />}>
        <UsersListContent />
      </Suspense>
    </div>
  );
};

export default EnterpriseUsersList;
