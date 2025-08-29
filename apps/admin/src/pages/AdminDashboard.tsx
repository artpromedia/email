import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Users, Shield, TrendingUp, FileText, AlertTriangle, CheckCircle } from 'lucide-react'

export function AdminDashboard() {
  // Mock data - in real implementation, fetch from API
  const stats = {
    totalUsers: 1247,
    quarantinedEmails: 23,
    deliverabilityScore: 98.5,
    auditEvents: 156
  }

  const recentActivity = [
    { id: 1, type: 'user_created', message: 'New user registered: john.doe@company.com', time: '2 minutes ago' },
    { id: 2, type: 'quarantine_release', message: 'Email released from quarantine', time: '15 minutes ago' },
    { id: 3, type: 'policy_update', message: 'MFA policy updated', time: '1 hour ago' },
    { id: 4, type: 'dkim_rotation', message: 'DKIM key rotated for domain example.com', time: '2 hours ago' },
  ]

  const alerts = [
    { id: 1, level: 'warning', message: 'DMARC policy failure rate increased to 2.1%' },
    { id: 2, level: 'info', message: 'Scheduled DKIM rotation in 7 days' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Overview of your CEERION mail system</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quarantined Emails</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.quarantinedEmails}</div>
            <p className="text-xs text-muted-foreground">-8% from yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deliverability Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.deliverabilityScore}%</div>
            <p className="text-xs text-green-600">Excellent performance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Audit Events</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.auditEvents}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>System Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                {alert.level === 'warning' ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                )}
                <p className="text-sm text-gray-700">{alert.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{activity.message}</p>
                  <p className="text-xs text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
