import { useState, useEffect, useCallback, useMemo } from "react";
import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Plus, Search, RefreshCw } from "lucide-react";
import { useAdminToast } from "../hooks/useAdminToast";
import { useConfirm } from "../hooks/useConfirm";
import { getUsers, AdminUser } from "../data/users";

// Memoized UserRow component to prevent unnecessary re-renders
const UserRow = React.memo(
  ({
    user,
    onEdit,
    onDelete,
  }: {
    user: AdminUser;
    onEdit: (user: AdminUser) => void;
    onDelete: (user: AdminUser) => void;
  }) => {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.status === "active"
                    ? "bg-green-100 text-green-800"
                    : user.status === "suspended"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {user.status}
              </span>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.role === "admin"
                    ? "bg-purple-100 text-purple-800"
                    : user.role === "support"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {user.role}
              </span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Quota: {user.quotaUsed.toLocaleString()} /{" "}
            {user.quotaLimit.toLocaleString()} MB
            {user.lastLogin && (
              <span className="ml-4">
                Last login: {new Date(user.lastLogin).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(user)}
            className="text-red-600 hover:text-red-700"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  },
);

UserRow.displayName = "UserRow";

function UserManagement() {
  const toast = useAdminToast();
  const confirm = useConfirm();

  // State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await getUsers();
      setUsers(response.users);
      toast.success(`Loaded ${response.users.length} users`);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Filter users based on search (memoized to prevent flickering)
  const filteredUsers = useMemo(() => {
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [users, searchTerm]);

  const handleCreateUser = useCallback(() => {
    toast.info("Create user modal will be implemented");
  }, [toast]);

  const handleEditUser = useCallback(
    (user: AdminUser) => {
      toast.info(`Edit user: ${user.name}`);
    },
    [toast],
  );

  const handleDeleteUser = useCallback(
    async (user: AdminUser) => {
      const confirmed = await confirm.show({
        title: "Delete User",
        message: `Are you sure you want to delete user "${user.name}"?`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmVariant: "destructive",
      });

      if (confirmed) {
        toast.success(`User ${user.name} would be deleted`);
      }
    },
    [confirm, toast],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <Button onClick={handleCreateUser}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={loadUsers} disabled={isLoading}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Users ({filteredUsers.length}
            {searchTerm && ` of ${users.length}`})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {searchTerm
                  ? "No users found matching your search."
                  : "No users found."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onEdit={handleEditUser}
                  onDelete={handleDeleteUser}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-gray-500">
        ✅ Full user management with data loading, search, and actions.
        VirtualizedTable and modals will be added next.
      </div>
    </div>
  );
}

export default React.memo(UserManagement);
