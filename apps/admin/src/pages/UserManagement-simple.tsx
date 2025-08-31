import React from "react";

function UserManagement() {
  console.log("UserManagement component is rendering...");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">User Management</h1>
      <p className="text-gray-600">
        User management page is loading successfully!
      </p>
      <div className="mt-4 p-4 bg-blue-100 rounded-lg">
        <p className="text-blue-800">✅ Users page is working!</p>
      </div>
    </div>
  );
}

export default UserManagement;
