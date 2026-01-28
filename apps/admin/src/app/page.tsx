import Link from "next/link";
import {
  Mail,
  Users,
  Globe,
  Activity,
  Settings,
  BarChart3,
  Shield,
  AlertTriangle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@email/ui";

// Mock data for dashboard
const stats = {
  totalEmails: 1_234_567,
  emailsToday: 12_345,
  activeUsers: 1_234,
  activeDomains: 5,
  deliveryRate: 99.2,
  bounceRate: 0.8,
};

const domains = [
  { name: "example.com", status: "active", emails: 456_789, users: 543 },
  { name: "example.org", status: "active", emails: 234_567, users: 321 },
  { name: "subsidiary.com", status: "active", emails: 123_456, users: 234 },
  { name: "newdomain.io", status: "pending", emails: 0, users: 0 },
];

const recentAlerts = [
  { id: 1, type: "warning", message: "High bounce rate detected for example.org", time: "5m ago" },
  { id: 2, type: "info", message: "Domain verification pending for newdomain.io", time: "1h ago" },
  { id: 3, type: "success", message: "DKIM keys rotated for example.com", time: "2h ago" },
];

export default function AdminDashboard() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Mail className="h-6 w-6 text-primary" />
          <span className="font-bold">Admin Portal</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
          >
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/domains"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Globe className="h-4 w-4" />
            Domains
          </Link>
          <Link
            href="/admin/users"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/email-logs"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Mail className="h-4 w-4" />
            Email Logs
          </Link>
          <Link
            href="/admin/security"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Shield className="h-4 w-4" />
            Security
          </Link>
          <Link
            href="/admin/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-6">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              <Activity className="mr-2 h-4 w-4" />
              System Status
            </Button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6">
          {/* Stats Grid */}
          <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.totalEmails.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  +{stats.emailsToday.toLocaleString()} today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeUsers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across all domains</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.deliveryRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Bounce rate: {stats.bounceRate}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Domains</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeDomains}</div>
                <p className="text-xs text-muted-foreground">1 pending verification</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Domains Table */}
            <Card>
              <CardHeader>
                <CardTitle>Domains</CardTitle>
                <CardDescription>
                  Multi-domain email infrastructure overview
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {domains.map((domain) => (
                    <div
                      key={domain.name}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{domain.name}</span>
                          <Badge
                            variant={domain.status === "active" ? "success" : "warning"}
                          >
                            {domain.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {domain.emails.toLocaleString()} emails • {domain.users} users
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>System notifications and warnings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-4 rounded-lg border p-4"
                    >
                      <AlertTriangle
                        className={`h-5 w-5 ${
                          alert.type === "warning"
                            ? "text-yellow-500"
                            : alert.type === "success"
                              ? "text-green-500"
                              : "text-blue-500"
                        }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">{alert.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
