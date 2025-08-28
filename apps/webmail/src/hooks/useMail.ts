import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export interface Message {
  id: string
  messageId: string
  threadId?: string
  from: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  htmlBody?: string
  attachments: any[]
  flags?: string[]
  folder: string
  labels: string[]
  receivedAt: string
  sentAt?: string
  createdAt: string
  updatedAt: string
}

export interface MessagesResponse {
  messages: Message[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// Messages hooks
export function useMessages(params?: {
  folder?: string
  label?: string
  search?: string
  limit?: number
  offset?: number
}) {
  const { client } = useAuth()

  return useQuery({
    queryKey: ['messages', params],
    queryFn: async () => {
      const response = await client.mail.getMessages(params)
      return response.data
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useMessage(id: string) {
  const { client } = useAuth()

  return useQuery({
    queryKey: ['message', id],
    queryFn: async () => {
      const response = await client.mail.getMessage(id)
      return response.data
    },
    enabled: !!id,
    staleTime: 60000, // 1 minute
  })
}

// Send message mutation
export function useSendMessage() {
  const { client } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      to: string[]
      cc?: string[]
      bcc?: string[]
      subject: string
      body: string
      htmlBody?: string
      attachments?: string[]
      priority?: 'low' | 'normal' | 'high'
    }) => {
      const response = await client.mail.send({
        ...data,
        priority: data.priority || 'normal',
      })
      return response.data
    },
    onSuccess: () => {
      // Invalidate messages to refresh the list
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success('Message sent successfully!')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to send message'
      toast.error(message)
    },
  })
}

// Draft mutations
export function useSaveDraft() {
  const { client } = useAuth()

  return useMutation({
    mutationFn: async (data: {
      to?: string[]
      cc?: string[]
      bcc?: string[]
      subject?: string
      body?: string
      htmlBody?: string
      attachments?: string[]
    }) => {
      const response = await client.mail.saveDraft(data)
      return response.data
    },
    onSuccess: () => {
      toast.success('Draft saved!')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to save draft'
      toast.error(message)
    },
  })
}

// Message actions
export function useMarkMessages() {
  const { client } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      messageIds: string[]
      action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive'
    }) => {
      const response = await client.mail.mark(data)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['message'] })
      
      const actionMessages = {
        read: 'Marked as read',
        unread: 'Marked as unread',
        flag: 'Flagged',
        unflag: 'Unflagged',
        archive: 'Archived',
      }
      toast.success(actionMessages[variables.action])
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Action failed'
      toast.error(message)
    },
  })
}

export function useMoveMessages() {
  const { client } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      messageIds: string[]
      folder: string
    }) => {
      const response = await client.mail.move(data)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success(`Moved to ${variables.folder}`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Move failed'
      toast.error(message)
    },
  })
}

export function useSnoozeMessages() {
  const { client } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      messageIds: string[]
      snoozeUntil: string
    }) => {
      const response = await client.mail.snooze(data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success('Messages snoozed')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Snooze failed'
      toast.error(message)
    },
  })
}

// Trusted senders
export function useTrustedSenders() {
  const { client } = useAuth()

  return useQuery({
    queryKey: ['trusted-senders'],
    queryFn: async () => {
      const response = await client.policy.getTrustedSenders()
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useAddTrustedSender() {
  const { client } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { email: string; domain?: string }) => {
      const response = await client.policy.addTrustedSender(data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trusted-senders'] })
      toast.success('Sender added to trusted list')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to add trusted sender'
      toast.error(message)
    },
  })
}
