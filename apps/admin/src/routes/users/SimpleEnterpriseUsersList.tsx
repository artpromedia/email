import React, { useState, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Users,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
} from "lucide-react";
import {
  useUsers,
  useUsersParams,
  type AdminUser,
} from "../../data/users-simple";
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
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useDebounce } from "../../hooks/useDebounce";

// Simple Toolbar Component
const SimpleToolbar = () => {
  const { params, updateParams } = useUsersParams();
  const [searchInput, setSearchInput] = useState(params.query || "");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Update URL when debounced search changes
  React.useEffect(() => {
    updateParams({ query: debouncedSearch });
  }, [debouncedSearch, updateParams]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        </div>

        <Link to="/users/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </Link>
      </div>

      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search users..."
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
            <SelectItem value="">All Roles</SelectItem>
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
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

// Simple User Row
const UserRow = ({ user }: { user: AdminUser }) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const quota = Math.round((user.quotaUsed / user.quotaLimit) * 100);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
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

      <td className="px-4 py-3">
        <Badge
          variant={user.role === "admin" ? "default" : "secondary"}
          className="capitalize"
        >
          {user.role}
        </Badge>
      </td>

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

      <td className="px-4 py-3">
        <Badge
          variant={user.mfaEnabled ? "default" : "secondary"}
          className={user.mfaEnabled ? "bg-green-100 text-green-700" : ""}
        >
          {user.mfaEnabled ? "Enabled" : "Disabled"}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              {Math.round(user.quotaUsed / 1024)} /{" "}
              {Math.round(user.quotaLimit / 1024)} MB
            </span>
            <span className="text-xs text-gray-500">{quota}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                quota > 90
                  ? "bg-red-500"
                  : quota > 70
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
              style={{ width: `${Math.min(quota, 100)}%` }}
            />
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(user.lastActive)}
      </td>

      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(user.createdAt)}
      </td>

      <td className="px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/users/${user.id}`} className="cursor-pointer">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Shield className="h-4 w-4 mr-2" />
              Toggle Admin
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
};

// Main Content Component
const UsersListContent = () => {
  const { data: usersResponse, isLoading, error } = useUsers();

  if (isLoading) {
    return <UserListSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">
          Error loading users: {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!usersResponse) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <SimpleToolbar />
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
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
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
        </div>

        {usersResponse.users.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500">No users found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Main Component
export const SimpleEnterpriseUsersList = () => {
  return (
    <div className="p-6 space-y-6">
      <Suspense fallback={<UserListSkeleton />}>
        <UsersListContent />
      </Suspense>
    </div>
  );
};

export default SimpleEnterpriseUsersList;
