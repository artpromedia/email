import { useEffect, useState } from 'react'
import { Shield, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useQuarantine } from '@/hooks/useQuarantine'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

export function QuarantinePage() {
  const { messages, loading, getQuarantinedMessages, requestRelease } = useQuarantine()
  const { t, formatDate, formatTime } = useI18n()
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    getQuarantinedMessages()
  }, [])

  const handleRequestRelease = async (messageId: string) => {
    setProcessingId(messageId)
    try {
      await requestRelease(messageId)
    } catch (error) {
      console.error('Failed to request release:', error)
    } finally {
      setProcessingId(null)
    }
  }

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-500 bg-red-50 border-red-200'
      case 'medium': return 'text-orange-500 bg-orange-50 border-orange-200'
      case 'low': return 'text-yellow-500 bg-yellow-50 border-yellow-200'
      default: return 'text-gray-500 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'quarantined':
        return <Shield className="h-4 w-4 text-orange-500" />
      case 'release-requested':
        return <Clock className="h-4 w-4 text-blue-500" />
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'denied':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'quarantined': return 'Quarantined'
      case 'release-requested': return 'Release Requested'
      case 'approved': return 'Approved'
      case 'denied': return 'Denied'
      default: return 'Unknown'
    }
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="quarantine-page">
      {/* Header */}
      <div className="quarantine-header">
        <div className="flex items-center gap-3 p-6 border-b">
          <Shield className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">{t('quarantine.title')}</h1>
            <p className="text-sm text-muted-foreground">
              Messages blocked by security policies
            </p>
          </div>
        </div>

        {/* Admin Approval Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg mx-6 mt-4 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900">
                {t('quarantine.admin_approval')}
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                Release requests require administrator approval. Contact your IT team for urgent matters.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Message List */}
      <div className="quarantine-list">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No quarantined messages</h3>
            <p className="text-muted-foreground">
              All your messages are clean and delivered to your inbox.
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className="quarantine-item border rounded-lg p-4 bg-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Message Header */}
                    <div className="flex items-center gap-3 mb-3">
                      {getStatusIcon(message.status)}
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs font-medium",
                          getRiskLevelColor(message.riskLevel)
                        )}
                      >
                        {message.riskLevel.toUpperCase()} RISK
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {getStatusText(message.status)}
                      </Badge>
                    </div>

                    {/* Message Details */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">
                        {message.subject}
                      </h3>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          <strong>From:</strong> {message.from.name || message.from.email}
                        </span>
                        <span>
                          <strong>Date:</strong> {formatDate(message.date)} at {formatTime(message.date)}
                        </span>
                      </div>

                      <div className="text-sm">
                        <span className="font-medium text-orange-600">Reason:</span>
                        <span className="ml-2">{message.reason}</span>
                      </div>

                      {message.requestedAt && (
                        <div className="text-sm text-blue-600">
                          <span className="font-medium">Release requested:</span>
                          <span className="ml-2">
                            {formatDate(message.requestedAt)} at {formatTime(message.requestedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    {message.canRequestRelease && message.status === 'quarantined' && (
                      <Button
                        size="sm"
                        onClick={() => handleRequestRelease(message.id)}
                        disabled={processingId === message.id}
                        className="whitespace-nowrap"
                      >
                        {processingId === message.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                            Requesting...
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4 mr-2" />
                            {t('quarantine.request_release')}
                          </>
                        )}
                      </Button>
                    )}

                    {message.status === 'release-requested' && (
                      <div className="text-xs text-blue-600 text-center">
                        Pending Admin<br />Approval
                      </div>
                    )}

                    {!message.canRequestRelease && message.status === 'quarantined' && (
                      <div className="text-xs text-red-600 text-center">
                        Release Not<br />Available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
