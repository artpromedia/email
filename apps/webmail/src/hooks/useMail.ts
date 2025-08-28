import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export interface Message {
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
  cc?: {
    name: string
    email: string
  }[]
  bcc?: {
    name: string
    email: string
  }[]
  date: string
  preview: string
  body?: string
  htmlBody?: string
  attachments?: {
    id: string
    name: string
    size: number
    contentType: string
  }[]
  labels: string[]
  categories: string[]
  isRead: boolean
  isFlagged: boolean
  isArchived: boolean
  priority: 'low' | 'normal' | 'high'
  folder: string
}

export interface MailFilters {
  folder?: string
  label?: string
  search?: string
  limit?: number
  offset?: number
}

// Helper function to map API response to our Message interface
function mapApiMessage(apiMessage: any): Message {
  return {
    id: apiMessage.id,
    subject: apiMessage.subject || '(No Subject)',
    from: {
      name: apiMessage.from?.split('<')[0]?.trim() || apiMessage.from || 'Unknown',
      email: apiMessage.from?.match(/<(.+)>/)?.[1] || apiMessage.from || ''
    },
    to: Array.isArray(apiMessage.to) ? apiMessage.to.map((addr: string) => ({
      name: addr.split('<')[0]?.trim() || addr,
      email: addr.match(/<(.+)>/)?.[1] || addr
    })) : [{
      name: apiMessage.to?.split('<')[0]?.trim() || apiMessage.to || 'Unknown',
      email: apiMessage.to?.match(/<(.+)>/)?.[1] || apiMessage.to || ''
    }],
    cc: apiMessage.cc ? (Array.isArray(apiMessage.cc) ? apiMessage.cc.map((addr: string) => ({
      name: addr.split('<')[0]?.trim() || addr,
      email: addr.match(/<(.+)>/)?.[1] || addr
    })) : []) : undefined,
    date: apiMessage.createdAt || new Date().toISOString(),
    preview: apiMessage.body?.substring(0, 150) || '',
    body: apiMessage.body,
    htmlBody: apiMessage.htmlBody,
    labels: apiMessage.labels || [],
    categories: apiMessage.categories || [],
    isRead: apiMessage.isRead || false,
    isFlagged: apiMessage.isFlagged || false,
    isArchived: apiMessage.isArchived || false,
    priority: apiMessage.priority || 'normal',
    folder: apiMessage.folder || 'inbox',
    attachments: apiMessage.attachments || []
  }
}

export interface MailFilters {
  folder?: string
  label?: string
  search?: string
  limit?: number
  offset?: number
}

export function useMail() {
  const { client } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getMessages = async (filters: MailFilters = {}) => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error: apiError } = await client.mail.getMessages(filters)
      
      if (data && !apiError) {
        const mappedMessages = (data.messages || []).map(mapApiMessage)
        setMessages(mappedMessages)
      } else {
        throw new Error('Failed to fetch messages')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const getMessage = async (id: string) => {
    try {
      const { data, error } = await client.mail.getMessage(id)
      
      if (data && !error) {
        return data
      } else {
        throw new Error('Failed to fetch message')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch message'
      toast.error(errorMessage)
      throw err
    }
  }

  const sendMessage = async (messageData: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    body: string
    htmlBody?: string
    attachments?: string[]
    priority: 'low' | 'normal' | 'high'
  }) => {
    try {
      const { data, error } = await client.mail.send(messageData)
      
      if (data && !error) {
        toast.success('Message sent successfully!')
        return data
      } else {
        throw new Error('Failed to send message')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      toast.error(errorMessage)
      throw err
    }
  }

  const saveDraft = async (draftData: {
    to?: string[]
    cc?: string[]
    bcc?: string[]
    subject?: string
    body?: string
    htmlBody?: string
    attachments?: string[]
  }) => {
    try {
      const { data, error } = await client.mail.saveDraft(draftData)
      
      if (data && !error) {
        toast.success('Draft saved')
        return data
      } else {
        throw new Error('Failed to save draft')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save draft'
      toast.error(errorMessage)
      throw err
    }
  }

  const markMessages = async (
    messageIds: string[], 
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive'
  ) => {
    try {
      const { data, error } = await client.mail.mark({
        messageIds,
        action
      })
      
      if (data && !error) {
        toast.success(`Messages ${action}ed successfully`)
        // Update local state
        setMessages(prev => prev.map(msg => {
          if (messageIds.includes(msg.id)) {
            switch (action) {
              case 'read':
                return { ...msg, isRead: true }
              case 'unread':
                return { ...msg, isRead: false }
              case 'flag':
                return { ...msg, isFlagged: true }
              case 'unflag':
                return { ...msg, isFlagged: false }
              case 'archive':
                return { ...msg, isArchived: true }
            }
          }
          return msg
        }))
        return data
      } else {
        throw new Error(`Failed to ${action} messages`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} messages`
      toast.error(errorMessage)
      throw err
    }
  }

  const moveMessages = async (messageIds: string[], folder: string) => {
    try {
      const { data, error } = await client.mail.move({
        messageIds,
        folder
      })
      
      if (data && !error) {
        toast.success(`Messages moved to ${folder}`)
        // Remove from current list if moved to different folder
        setMessages(prev => prev.filter(msg => !messageIds.includes(msg.id)))
        return data
      } else {
        throw new Error('Failed to move messages')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to move messages'
      toast.error(errorMessage)
      throw err
    }
  }

  const snoozeMessages = async (messageIds: string[], snoozeUntil: string) => {
    try {
      const { data, error } = await client.mail.snooze({
        messageIds,
        snoozeUntil
      })
      
      if (data && !error) {
        toast.success('Messages snoozed')
        // Remove from current list
        setMessages(prev => prev.filter(msg => !messageIds.includes(msg.id)))
        return data
      } else {
        throw new Error('Failed to snooze messages')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to snooze messages'
      toast.error(errorMessage)
      throw err
    }
  }

  return {
    messages,
    loading,
    error,
    getMessages,
    getMessage,
    sendMessage,
    saveDraft,
    markMessages,
    moveMessages,
    snoozeMessages,
  }
}
