import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Edit, Shield, Mail, Calendar, Clock } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

// Mock user data - in real app, this would come from API
const mockUsers: any[] = [
  {
    id: "1",
    email: "john.doe@ceerion.com",
    firstName: "John",
    lastName: "Doe",
    name: "John Doe",
    status: "active",
    role: "admin",
    enabled: true,
    mfaEnabled: true,
    lastLogin: "2024-01-15T10:30:00Z",
    lastActive: "2024-01-15T14:22:00Z",
    createdAt: "2023-06-01T09:00:00Z",
    updatedAt: "2024-01-15T14:22:00Z",
    quotaUsed: 2.5,
    quotaLimit: 10,
  },
  {
    id: "2",
    email: "jane.smith@ceerion.com",
    firstName: "Jane",
    lastName: "Smith",
    name: "Jane Smith",
    status: "active",
    role: "user",
    enabled: true,
    mfaEnabled: false,
    lastLogin: "2024-01-14T16:45:00Z",
    lastActive: "2024-01-14T17:30:00Z",
    createdAt: "2023-08-15T11:30:00Z",
    updatedAt: "2024-01-14T17:30:00Z",
    quotaUsed: 1.2,
    quotaLimit: 5,
  },
];

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Find user by ID - in real app, use API call
  const user = mockUsers.find((u) => u.id === id);

  if (!user) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Link
            to="/users"
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Users
          </Link>
        </div>
        <div className="text-center py-12">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            User Not Found
          </h2>
          <p className="text-gray-600">
            The user you're looking for doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      active: "bg-green-100 text-green-800",
      suspended: "bg-red-100 text-red-800",
      pending: "bg-yellow-100 text-yellow-800",
    };
    return variants[status] || "bg-gray-100 text-gray-800";
  };

  const getRoleBadge = (role: string) => {
    const variants: any = {
      admin: "bg-purple-100 text-purple-800",
      user: "bg-blue-100 text-blue-800",
      support: "bg-orange-100 text-orange-800",
    };
    return variants[role] || "bg-gray-100 text-gray-800";
  };

  // Button handlers
  const handleEditUser = () => {
    navigate(`/users/${id}/edit`);
  };

  const handleResetPassword = async () => {
    setIsLoading(true);
    try {
      // In real app, call API
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      alert(`Password reset email sent to ${user?.email}`);
    } catch (error) {
      alert("Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAccount = async () => {
    setIsLoading(true);
    try {
      // In real app, call API
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      const action = user?.enabled ? "disabled" : "enabled";
      alert(`User account ${action} successfully`);
      // In real app, refetch user data
    } catch (error) {
      alert("Failed to update account status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMFA = async () => {
    setIsLoading(true);
    try {
      // In real app, call API
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      const action = user?.mfaEnabled ? "disabled" : "enabled";
      alert(`MFA ${action} successfully`);
      // In real app, refetch user data
    } catch (error) {
      alert("Failed to update MFA status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (
      !confirm(
        `Are you sure you want to delete ${user?.name}? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      // In real app, call API
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      alert("User deleted successfully");
      navigate("/users");
    } catch (error) {
      alert("Failed to delete user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/users"
          className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-600">{user.email}</p>
          </div>
          <Button className="flex items-center gap-2" onClick={handleEditUser}>
            <Edit className="h-4 w-4" />
            Edit User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    First Name
                  </label>
                  <p className="text-gray-900">{user.firstName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Last Name
                  </label>
                  <p className="text-gray-900">{user.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Email
                  </label>
                  <p className="text-gray-900 flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                    {user.email}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Role
                  </label>
                  <div className="mt-1">
                    <Badge className={getRoleBadge(user.role)}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Status */}
          <Card>
            <CardHeader>
              <CardTitle>Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Status
                  </label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(user.status)}>
                      {user.status.charAt(0).toUpperCase() +
                        user.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Account Enabled
                  </label>
                  <p className="text-gray-900">{user.enabled ? "Yes" : "No"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    MFA Enabled
                  </label>
                  <div className="flex items-center">
                    <Shield
                      className={`h-4 w-4 mr-2 ${user.mfaEnabled ? "text-green-600" : "text-gray-400"}`}
                    />
                    <span className="text-gray-900">
                      {user.mfaEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Quota Usage
                  </label>
                  <p className="text-gray-900">
                    {user.quotaUsed} GB / {user.quotaLimit} GB
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{
                        width: `${(user.quotaUsed / user.quotaLimit) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity & Timestamps */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Last Login
                </label>
                <p className="text-sm text-gray-900">
                  {formatDate(user.lastLogin)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Last Active
                </label>
                <p className="text-sm text-gray-900">
                  {formatDate(user.lastActive)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Created
                </label>
                <p className="text-sm text-gray-900 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                  {formatDate(user.createdAt)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Last Updated
                </label>
                <p className="text-sm text-gray-900">
                  {formatDate(user.updatedAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleResetPassword}
                disabled={isLoading}
              >
                Reset Password
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleToggleAccount}
                disabled={isLoading}
              >
                {user?.enabled ? "Disable Account" : "Enable Account"}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleToggleMFA}
                disabled={isLoading}
              >
                {user?.mfaEnabled ? "Disable MFA" : "Enable MFA"}
              </Button>
              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={handleDeleteUser}
                disabled={isLoading}
              >
                Delete User
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
