import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, X } from "lucide-react";
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

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Find user by ID
  const user = mockUsers.find((u) => u.id === id);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "user",
    enabled: true,
    mfaEnabled: false,
    quotaLimit: 5,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        enabled: user.enabled,
        mfaEnabled: user.mfaEnabled,
        quotaLimit: user.quotaLimit,
      });
    }
  }, [user]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // In real app, this would call the API
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      console.log("Updating user:", formData);
      alert("User updated successfully!");
      navigate(`/users/${id}`);
    } catch (error) {
      alert("Failed to update user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/users/${id}`}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to User Details
        </Link>

        <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
        <p className="text-gray-600">Update {user.name}'s information</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  First Name *
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Last Name *
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="support">Support</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="quotaLimit"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Quota Limit (GB)
                </label>
                <input
                  type="number"
                  id="quotaLimit"
                  name="quotaLimit"
                  value={formData.quotaLimit}
                  onChange={handleChange}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enabled"
                  name="enabled"
                  checked={formData.enabled}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="enabled"
                  className="ml-2 block text-sm text-gray-900"
                >
                  Account Enabled
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="mfaEnabled"
                  name="mfaEnabled"
                  checked={formData.mfaEnabled}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="mfaEnabled"
                  className="ml-2 block text-sm text-gray-900"
                >
                  Require Multi-Factor Authentication
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/users/${id}`)}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
