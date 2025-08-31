import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Plus, Search, RefreshCw } from "lucide-react";
import { VirtualizedUserTable } from "../components/VirtualizedUserTable";
import { CreateUserDrawer } from "../components/CreateUserDrawer";
import { ResetPasswordModal } from "../components/ResetPasswordModal";
import { SetQuotaModal } from "../components/SetQuotaModal";
import { useAdminToast } from "../hooks/useAdminToast";
import { useConfirm } from "../hooks/useConfirm";
import {
  getUsers,
  createUser,
  resetUserPassword,
  updateUser,
  deleteUser,
  AdminUser,
  CreateUserRequest,
  ResetPasswordResponse,
} from "../data/users";

function UserManagement() {
  const toast = useAdminToast();
  const confirm = useConfirm();

  // State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState<{
    open: boolean;
    user?: AdminUser;
    resetData?: ResetPasswordResponse;
  }>({ open: false });
  const [setQuotaModal, setSetQuotaModal] = useState<{
    open: boolean;
    user?: AdminUser;
  }>({ open: false });

  // Load users
  const loadUsers = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        const response = await getUsers({ query: searchTerm });
        setUsers(response.users);
      } catch (error) {
        toast.error("Failed to load users");
        console.error("Failed to load users:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [searchTerm], // Removed toast from dependencies
  );

  // Initial load and search effect with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadUsers();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [loadUsers]);

  // Optimistic UI helper
  const updateUserOptimistically = (
    userId: string,
    updates: Partial<AdminUser>,
  ) => {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, ...updates } : user,
      ),
    );
  };

  // Action handlers
  const handleCreateUser = async (userData: CreateUserRequest) => {
    try {
      const newUser = await createUser(userData);
      setUsers((prevUsers) => [newUser, ...prevUsers]);
      toast.success("User created successfully • View in Audit Log");
    } catch (error) {
      toast.error("Failed to create user");
      throw error;
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      const resetData = await resetUserPassword(user.id);
      setResetPasswordModal({
        open: true,
        user,
        resetData,
      });
      toast.success("Password reset generated • View in Audit Log");
    } catch (error) {
      toast.error("Failed to reset password");
    }
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    const actionText =
      newRole === "admin"
        ? "grant admin privileges to"
        : "remove admin privileges from";

    const confirmed = await confirm.show({
      title: `${newRole === "admin" ? "Grant" : "Remove"} Admin Privileges`,
      message: `Are you sure you want to ${actionText} ${user.name}?`,
      confirmText: newRole === "admin" ? "Grant Admin" : "Remove Admin",
      cancelText: "Cancel",
    });

    if (!confirmed) return;

    // Optimistic update
    updateUserOptimistically(user.id, { role: newRole });

    try {
      await updateUser(user.id, { role: newRole });
      toast.success(
        `User ${newRole === "admin" ? "granted admin" : "admin removed"} • View in Audit Log`,
      );
    } catch (error) {
      // Rollback optimistic update
      updateUserOptimistically(user.id, { role: user.role });
      toast.error(
        `Failed to ${newRole === "admin" ? "grant admin privileges" : "remove admin privileges"}`,
      );
    }
  };

  const handleToggleEnabled = async (user: AdminUser) => {
    const newEnabled = !user.enabled;
    const actionText = newEnabled ? "enable" : "disable";

    const confirmed = await confirm.show({
      title: `${newEnabled ? "Enable" : "Disable"} User`,
      message: `Are you sure you want to ${actionText} ${user.name}? ${!newEnabled ? "They will not be able to access their account." : ""}`,
      confirmText: newEnabled ? "Enable User" : "Disable User",
      cancelText: "Cancel",
    });

    if (!confirmed) return;

    // Optimistic update
    updateUserOptimistically(user.id, {
      enabled: newEnabled,
      status: newEnabled ? "active" : "suspended",
    });

    try {
      await updateUser(user.id, { enabled: newEnabled });
      toast.success(`User ${actionText}d • View in Audit Log`);
    } catch (error) {
      // Rollback optimistic update
      updateUserOptimistically(user.id, {
        enabled: user.enabled,
        status: user.status,
      });
      toast.error(`Failed to ${actionText} user`);
    }
  };

  const handleSetQuota = async (user: AdminUser, quotaLimit: number) => {
    // Optimistic update
    updateUserOptimistically(user.id, { quotaLimit });

    try {
      await updateUser(user.id, { quotaLimit });
      toast.success("Storage quota updated • View in Audit Log");
    } catch (error) {
      // Rollback optimistic update
      updateUserOptimistically(user.id, { quotaLimit: user.quotaLimit });
      toast.error("Failed to update storage quota");
      throw error;
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    const confirmed = await confirm.show({
      title: "Delete User",
      message: `Are you sure you want to delete ${user.name}? This action cannot be undone and will permanently remove all their data.`,
      confirmText: "Delete User",
      cancelText: "Cancel",
    });

    if (!confirmed) return;

    try {
      await deleteUser(user.id);
      setUsers((prevUsers) => prevUsers.filter((u) => u.id !== user.id));
      toast.success("User deleted • View in Audit Log");
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [users, searchTerm]);

  // Memoized callback functions for VirtualizedUserTable
  const handleSetQuotaClick = useCallback((user: AdminUser) => {
    setSetQuotaModal({ open: true, user });
  }, []);

  const memoizedHandleResetPassword = useCallback(handleResetPassword, []);
  const memoizedHandleToggleAdmin = useCallback(handleToggleAdmin, []);
  const memoizedHandleToggleEnabled = useCallback(handleToggleEnabled, []);
  const memoizedHandleDeleteUser = useCallback(handleDeleteUser, [confirm]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Loading users...</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">
            Manage user accounts, permissions, and quotas
          </p>
        </div>
        <Button onClick={() => setShowCreateDrawer(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Search and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadUsers(true)}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users by name, email, or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Virtualized User Table */}
          <VirtualizedUserTable
            users={filteredUsers}
            height={600}
            onResetPassword={memoizedHandleResetPassword}
            onToggleAdmin={memoizedHandleToggleAdmin}
            onToggleEnabled={memoizedHandleToggleEnabled}
            onSetQuota={handleSetQuotaClick}
            onDeleteUser={memoizedHandleDeleteUser}
          />
        </CardContent>
      </Card>

      {/* Create User Drawer */}
      <CreateUserDrawer
        open={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        onCreateUser={handleCreateUser}
      />

      {/* Reset Password Modal */}
      <ResetPasswordModal
        open={resetPasswordModal.open}
        onClose={() => setResetPasswordModal({ open: false })}
        userName={resetPasswordModal.user?.name || ""}
        userEmail={resetPasswordModal.user?.email || ""}
        resetData={resetPasswordModal.resetData}
      />

      {/* Set Quota Modal */}
      <SetQuotaModal
        open={setQuotaModal.open}
        onClose={() => setSetQuotaModal({ open: false })}
        user={setQuotaModal.user}
        onSetQuota={async (quotaLimit) => {
          if (setQuotaModal.user) {
            await handleSetQuota(setQuotaModal.user, quotaLimit);
            setSetQuotaModal({ open: false });
          }
        }}
      />
    </div>
  );
}

export default UserManagement;
