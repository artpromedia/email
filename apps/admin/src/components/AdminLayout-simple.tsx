import { Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">CEERION Admin</h1>
        <nav className="mb-6 space-x-4">
          <a
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Dashboard
          </a>
          <a
            href="/users"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Users
          </a>
          <a
            href="/quarantine"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Quarantine
          </a>
          <a
            href="/audit-logs"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Audit Logs
          </a>
          <a
            href="/policies"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Policies
          </a>
          <a
            href="/domains"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Domains
          </a>
          <a
            href="/analytics"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Analytics
          </a>
          <a
            href="/settings"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            System Settings
          </a>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
