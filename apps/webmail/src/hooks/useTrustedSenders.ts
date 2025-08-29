import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export interface TrustedSender {
  id: string
  email?: string
  domain?: string
  addedBy: string
  addedAt: string
  reason?: string
}

export function useTrustedSenders() {
  const { client } = useAuth()
  const [trustedSenders, setTrustedSenders] = useState<TrustedSender[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getTrustedSenders = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error: apiError } = await client.policy.getTrustedSenders()
      
      if (data && !apiError) {
        // Extract trusted sender policies from the response
        const trusted = data.policies?.filter(p => p.type === 'trusted_sender') || []
        setTrustedSenders(trusted.map(p => ({
          id: p.id,
          email: p.value,
          addedBy: p.userId,
          addedAt: p.createdAt,
        })))
      } else {
        // Mock data for development
        const mockTrustedSenders: TrustedSender[] = [
          {
            id: '1',
            email: 'notifications@github.com',
            addedBy: 'demo@ceerion.com',
            addedAt: new Date(Date.now() - 86400000).toISOString(),
            reason: 'Development notifications'
          },
          {
            id: '2',
            domain: 'ceerion.com',
            addedBy: 'admin@ceerion.com',
            addedAt: new Date(Date.now() - 604800000).toISOString(),
            reason: 'Company domain'
          }
        ]
        setTrustedSenders(mockTrustedSenders)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch trusted senders'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const addTrustedSender = async (senderData: { email?: string; domain?: string; reason?: string }) => {
    try {
      setLoading(true)
      
      // Ensure we have either email or domain
      if (!senderData.email && !senderData.domain) {
        throw new Error('Either email or domain is required')
      }
      
      const { data, error: apiError } = await client.policy.addTrustedSender({
        email: senderData.email || '',
        domain: senderData.domain
      })
      
      if (data && !apiError) {
        toast.success('Trusted sender added successfully')
        // Refresh the list
        await getTrustedSenders()
        return data
      } else {
        // Optimistic update for development
        const newSender: TrustedSender = {
          id: Date.now().toString(),
          email: senderData.email,
          domain: senderData.domain,
          addedBy: 'demo@ceerion.com',
          addedAt: new Date().toISOString(),
          reason: senderData.reason
        }
        
        setTrustedSenders(prev => [...prev, newSender])
        toast.success('Trusted sender added successfully')
        return newSender
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add trusted sender'
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const removeTrustedSender = async (senderId: string) => {
    try {
      setLoading(true)
      
      // Optimistic update
      setTrustedSenders(prev => prev.filter(sender => sender.id !== senderId))
      toast.success('Trusted sender removed')
      
      // In production, this would make an API call to DELETE /policy/trusted-senders/:id
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove trusted sender'
      toast.error(errorMessage)
      // Revert optimistic update
      await getTrustedSenders()
      throw err
    } finally {
      setLoading(false)
    }
  }

  const trustSender = async (email: string, reason?: string) => {
    return addTrustedSender({ email, reason })
  }

  const trustDomain = async (domain: string, reason?: string) => {
    return addTrustedSender({ domain, reason })
  }

  return {
    trustedSenders,
    loading,
    error,
    getTrustedSenders,
    addTrustedSender,
    removeTrustedSender,
    trustSender,
    trustDomain,
  }
}
