import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export interface QuarantinedMessage {
  id: string
  subject: string
  from: {
    name: string
    email: string
  }
  to: {
    name: string
    email: string
  }[]
  date: string
  reason: string
  riskLevel: 'low' | 'medium' | 'high'
  canRequestRelease: boolean
  requestedAt?: string
  status: 'quarantined' | 'release-requested' | 'approved' | 'denied'
}

export function useQuarantine() {
  const { client } = useAuth()
  const [messages, setMessages] = useState<QuarantinedMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getQuarantinedMessages = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // For now, return mock data since API endpoint may not be implemented
      const mockMessages: QuarantinedMessage[] = [
        {
          id: 'q1',
          subject: 'Suspicious Email with Attachment',
          from: { name: 'Unknown Sender', email: 'suspicious@example.com' },
          to: [{ name: 'Demo User', email: 'demo@ceerion.com' }],
          date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          reason: 'Detected malicious attachment',
          riskLevel: 'high',
          canRequestRelease: false,
          status: 'quarantined'
        },
        {
          id: 'q2', 
          subject: 'Urgent: Update Your Account',
          from: { name: 'Fake Bank', email: 'noreply@fakebank.com' },
          to: [{ name: 'Demo User', email: 'demo@ceerion.com' }],
          date: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          reason: 'Phishing attempt detected',
          riskLevel: 'medium',
          canRequestRelease: true,
          status: 'quarantined'
        }
      ]
      
      setMessages(mockMessages)
      
      // Uncomment when API is ready
      // const { data, error: apiError } = await client.GET('/mail/quarantine')
      // if (data && !apiError) {
      //   setMessages(data.messages || [])
      // } else {
      //   throw new Error('Failed to fetch quarantined messages')
      // }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch quarantined messages'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const requestRelease = async (messageId: string) => {
    try {
      setLoading(true)
      
      // Update local state immediately for better UX
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'release-requested' as const, requestedAt: new Date().toISOString() }
          : msg
      ))
      
      toast.success('Release request submitted. Admin approval required.')
      
      // Uncomment when API is ready
      // const { data, error } = await client.POST('/mail/quarantine/{id}/request-release', {
      //   params: { path: { id: messageId } }
      // })
      // 
      // if (!data || error) {
      //   throw new Error('Failed to request release')
      // }
      
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request release'
      toast.error(errorMessage)
      // Revert optimistic update on error
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'quarantined' as const, requestedAt: undefined }
          : msg
      ))
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    messages,
    loading,
    error,
    getQuarantinedMessages,
    requestRelease,
  }
}
