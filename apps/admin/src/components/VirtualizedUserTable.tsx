// @ts-nocheck
import React, { useMemo } from "react";
import { FixedSizeList } from "react-window";
import { AdminUser } from "../data/users";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  MoreHorizontal,
  Shield,
  ShieldOff,
  Key,
  UserX,
  Trash2,
  HardDrive,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

interface VirtualizedUserTableProps {
  users: AdminUser[];
  onResetPassword: (user: AdminUser) => void;
  onToggleAdmin: (user: AdminUser) => void;
  onToggleEnabled: (user: AdminUser) => void;
  onSetQuota: (user: AdminUser) => void;
  onDeleteUser: (user: AdminUser) => void;
  height: number;
}

interface RowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    users: AdminUser[];
    onResetPassword: (user: AdminUser) => void;
    onToggleAdmin: (user: AdminUser) => void;
    onToggleEnabled: (user: AdminUser) => void;
    onSetQuota: (user: AdminUser) => void;
    onDeleteUser: (user: AdminUser) => void;
  };
}

const formatQuota = (used: number, limit: number) => {
  const percentage = (used / limit) * 100;
  return {
    text: `${used.toFixed(1)}GB / ${limit}GB`,
    percentage: Math.min(percentage, 100),
    isNearLimit: percentage > 80,
  };
};

const getRoleColor = (role: string) => {
  switch (role) {
    case "admin":
      return "bg-red-100 text-red-800";
    case "support":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getStatusColor = (status: string, enabled: boolean) => {
  if (!enabled) return "bg-gray-100 text-gray-800";
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "suspended":
      return "bg-red-100 text-red-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const UserRow: React.FC<RowProps> = React.memo(({ index, style, data }) => {
  const user = data.users[index];
  const quota = formatQuota(user.quotaUsed, user.quotaLimit);

  return (
    <div
      style={style}
      className="flex items-center px-6 py-4 border-b border-gray-200 hover:bg-gray-50"
    >
      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.name}
            </p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Role */}
      <div className="w-20">
        <Badge className={`text-xs ${getRoleColor(user.role)}`}>
          {user.role}
        </Badge>
      </div>

      {/* Status */}
      <div className="w-24">
        <Badge
          className={`text-xs ${getStatusColor(user.status, user.enabled)}`}
        >
          {!user.enabled ? "disabled" : user.status}
        </Badge>
      </div>

      {/* Quota */}
      <div className="w-32">
        <div className="flex items-center space-x-2">
          <HardDrive className="h-4 w-4 text-gray-400" />
          <div className="flex-1">
            <div className="text-xs text-gray-900">{quota.text}</div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full ${quota.isNearLimit ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${quota.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Device Info */}
      <div className="w-48">
        <div className="text-xs text-gray-900">{user.deviceInfo?.primary}</div>
        <div className="text-xs text-gray-500">
          {user.deviceInfo?.secondary}
        </div>
      </div>

      {/* Last Login */}
      <div className="w-24">
        <div className="text-xs text-gray-500">
          {user.lastLogin
            ? formatDistanceToNow(user.lastLogin, { addSuffix: true })
            : "Never"}
        </div>
      </div>

      {/* Actions */}
      <div className="w-16 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => data.onResetPassword(user)}>
              <Key className="mr-2 h-4 w-4" />
              Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => data.onToggleAdmin(user)}>
              {user.role === "admin" ? (
                <>
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Remove Admin
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Make Admin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => data.onToggleEnabled(user)}>
              <UserX className="mr-2 h-4 w-4" />
              {user.enabled ? "Disable" : "Enable"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => data.onSetQuota(user)}>
              <HardDrive className="mr-2 h-4 w-4" />
              Set Quota
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => data.onDeleteUser(user)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

export const VirtualizedUserTable: React.FC<VirtualizedUserTableProps> =
  React.memo(
    ({
      users,
      onResetPassword,
      onToggleAdmin,
      onToggleEnabled,
      onSetQuota,
      onDeleteUser,
      height,
    }) => {
      const itemData = useMemo(
        () => ({
          users,
          onResetPassword,
          onToggleAdmin,
          onToggleEnabled,
          onSetQuota,
          onDeleteUser,
        }),
        [
          users,
          onResetPassword,
          onToggleAdmin,
          onToggleEnabled,
          onSetQuota,
          onDeleteUser,
        ],
      );

      if (users.length === 0) {
        return (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium">No users found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          </div>
        );
      }

      return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
            <div className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex-1">User</div>
              <div className="w-20">Role</div>
              <div className="w-24">Status</div>
              <div className="w-32">Quota</div>
              <div className="w-48">Device Info</div>
              <div className="w-24">Last Login</div>
              <div className="w-16"></div>
            </div>
          </div>

          {/* Virtualized List */}
          <FixedSizeList
            height={height}
            itemCount={users.length}
            itemSize={80}
            itemData={itemData}
            width="100%"
          >
            {UserRow}
          </FixedSizeList>
        </div>
      );
    },
  );
