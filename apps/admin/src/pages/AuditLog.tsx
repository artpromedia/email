import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'

export function AuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-600">View and export system activity logs</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Audit logging functionality coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}
