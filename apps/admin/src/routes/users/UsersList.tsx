import React, { useState, useMemo, Suspense } from "react";
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
} from "lucide-react";
import {
  useUsers,
  useDeleteUser,
  type UsersListParams,
  type AdminUser,
} from "../../data/users-new";
import { PendingButton } from "../../components/PendingButton";
import { useAdminToast } from "../../hooks/useAdminToast";
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
} from "../../components/ui/dropdown-menu";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

// Memoized UserRow component for performance
const UserRow = React.memo(
  ({
    user,
    onEdit,
    onDelete,
    onToggleStatus,
  }: {
    user: AdminUser;
    onEdit: (user: AdminUser) => void;
    onDelete: (user: AdminUser) => void;
    onToggleStatus: (user: AdminUser) => void;
  }) => {
    return (
      <div className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600">
                  {user.firstName?.charAt(0)}
                  {user.lastName?.charAt(0)}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <Link
                  to={`/users/${user.id}`}
                  className="font-medium text-gray-900 hover:text-blue-600 truncate"
                >
                  {user.name}
                </Link>
                <Badge
                  variant={
                    user.status === "active"
                      ? "default"
                      : user.status === "suspended"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {user.status}
                </Badge>
                <Badge variant="outline">{user.role}</Badge>
                {user.mfaEnabled && (
                  <Badge
                    variant="outline"
                    className="text-green-600 border-green-200"
                  >
                    MFA
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
              <div className="text-xs text-gray-400">
                Quota: {user.quotaUsed.toLocaleString()} /{" "}
                {user.quotaLimit.toLocaleString()} MB
                {user.lastLogin && (
                  <span className="ml-3">
                    Last login: {new Date(user.lastLogin).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(user)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus(user)}>
                {user.status === "active" ? (
                  <>
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Suspend User
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Activate User
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(user)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  },
);

UserRow.displayName = "UserRow";

function UsersListContent() {
  const toast = useAdminToast();
  const confirm = useConfirm();
  const deleteUser = useDeleteUser();

  // Filters state
  const [filters, setFilters] = useState<UsersListParams>({
    query: "",
    role: "",
    status: "",
    mfa: "",
    page: 1,
    limit: 20,
  });

  // Fetch users with current filters
  const { data: usersResponse } = useUsers(filters);

  // Memoized filtered users for performance
  const users = useMemo(() => usersResponse?.users || [], [usersResponse]);

  const handleEdit = React.useCallback(
    (user: AdminUser) => {
      // Navigate to edit page (will be implemented)
      toast.info(`Edit user: ${user.name} (feature coming soon)`);
    },
    [toast],
  );

  const handleDelete = React.useCallback(
    async (user: AdminUser) => {
      const confirmed = await confirm.show({
        title: "Delete User",
        message: `Are you sure you want to delete "${user.name}"? This action cannot be undone.`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmVariant: "destructive",
      });

      if (confirmed) {
        try {
          await deleteUser.mutateAsync(user.id);
          toast.success(`User "${user.name}" has been deleted`);
        } catch (error) {
          toast.error("Failed to delete user");
        }
      }
    },
    [confirm, deleteUser, toast],
  );

  const handleToggleStatus = React.useCallback(
    (user: AdminUser) => {
      const newStatus = user.status === "active" ? "suspended" : "active";
      toast.info(
        `${newStatus === "active" ? "Activate" : "Suspend"} user: ${user.name} (feature coming soon)`,
      );
    },
    [toast],
  );

  const handleFilterChange = React.useCallback(
    (key: keyof UsersListParams, value: any) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-gray-600">
            Manage user accounts and permissions ({usersResponse?.total || 0}{" "}
            total)
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" asChild>
            <Link to="/users/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link to="/users/new">
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={filters.query || ""}
                onChange={(e) => handleFilterChange("query", e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={filters.role || ""}
              onValueChange={(value) => handleFilterChange("role", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status || ""}
              onValueChange={(value) => handleFilterChange("status", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.mfa?.toString() || ""}
              onValueChange={(value) =>
                handleFilterChange("mfa", value === "" ? "" : value === "true")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="MFA status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MFA</SelectItem>
                <SelectItem value="true">MFA Enabled</SelectItem>
                <SelectItem value="false">MFA Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filters.query ||
            filters.role ||
            filters.status ||
            filters.mfa !== "" ? (
              <>Filtered Results ({users.length})</>
            ) : (
              <>All Users ({users.length})</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {filters.query ||
                filters.role ||
                filters.status ||
                filters.mfa !== ""
                  ? "No users found matching your filters."
                  : "No users found."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {usersResponse?.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => handleFilterChange("page", (filters.page || 1) + 1)}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

export default function UsersList() {
  return (
    <Suspense fallback={<UserListSkeleton />}>
      <UsersListContent />
    </Suspense>
  );
}
