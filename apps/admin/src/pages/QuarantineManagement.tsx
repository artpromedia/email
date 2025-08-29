import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'

export function QuarantineManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Quarantine Management</h1>
        <p className="text-gray-600">Manage quarantined emails with bulk operations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quarantined Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Quarantine management functionality coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}
