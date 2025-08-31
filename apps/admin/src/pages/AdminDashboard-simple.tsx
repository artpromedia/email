import React from "react";

function AdminDashboard() {
  console.log("AdminDashboard component is rendering...");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <p className="text-gray-600">Dashboard is loading successfully!</p>
      <div className="mt-4 p-4 bg-green-100 rounded-lg">
        <p className="text-green-800">✅ Admin console is working!</p>
      </div>
    </div>
  );
}

export default AdminDashboard;
