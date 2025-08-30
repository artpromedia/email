import React, { Suspense } from "react";
import { UserListSkeleton } from "../../components/UserSkeletons";
import { Button } from "../../components/ui/button";
import { Users, Plus } from "lucide-react";

// Simple test component first
const TestUsersList = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="bg-white rounded-lg border p-8 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Enterprise User Management
        </h3>
        <p className="text-gray-500">
          Testing the new enterprise users component...
        </p>
      </div>
    </div>
  );
};

export default TestUsersList;
