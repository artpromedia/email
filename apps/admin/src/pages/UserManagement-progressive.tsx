import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Plus } from "lucide-react";
import { useAdminToast } from "../hooks/useAdminToast";

function UserManagement() {
  console.log("UserManagement component is rendering...");
  const toast = useAdminToast();
  const [users] = useState([
    {
      id: "1",
      email: "admin@ceerion.com",
      name: "Admin User",
      status: "active",
    },
    { id: "2", email: "john@example.com", name: "John Doe", status: "active" },
    {
      id: "3",
      email: "jane@example.com",
      name: "Jane Smith",
      status: "suspended",
    },
  ]);

  const handleCreateUser = () => {
    toast.success("Create user functionality will be implemented");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <Button onClick={handleCreateUser}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      user.status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {user.status}
                  </span>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-gray-500">
        ✅ Basic user management interface is working. Advanced features will be
        added progressively.
      </div>
    </div>
  );
}

export default UserManagement;
