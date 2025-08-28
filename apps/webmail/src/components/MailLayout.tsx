import { useState, useEffect } from 'react'
import { ArrowLeft, Search, Archive, Trash2, Star, MoreHorizontal, Plus, Shield } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { ComposeSheet } from './ComposeSheet'
import { useMail } from '../hooks/useMail'
import { useNotifications } from '../hooks/useNotifications'
import { useTrustedSenders } from '../hooks/useTrustedSenders'
import { useI18n } from '../contexts/I18nContext'
import { cn } from '../lib/utils'

export function MailLayout() {
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  
  const { 
    messages, 
    loading, 
    getMessages, 
    markMessages, 
    moveMessages, 
    snoozeMessages 
  } = useMail()
  
  const { 
    permission: notificationPermission, 
    requestPermission: requestNotificationPermission
  } = useNotifications()
  
  const { trustSender } = useTrustedSenders()
  const { t, formatDate, formatTime } = useI18n()

  // Load messages on mount
  useEffect(() => {
    getMessages({ folder: 'inbox' })
  }, [])

  // Request notification permission on mount
  useEffect(() => {
    if (!notificationPermission.granted && !notificationPermission.denied) {
      requestNotificationPermission()
    }
  }, [notificationPermission, requestNotificationPermission])

  const categories = ['Primary', 'Social', 'Promotions', 'Updates']

  const handleMessageSelect = (messageId: string) => {
    setSelectedMessage(messageId)
    setShowThread(true)
    // Mark as read when opened
    markMessages([messageId], 'read')
  }

  const handleBackToList = () => {
    setShowThread(false)
    setSelectedMessage(null)
  }

  const handleMarkRead = () => {
    if (selectedMessages.length > 0) {
      markMessages(selectedMessages, 'read')
      setSelectedMessages([])
    }
  }

  const handleArchive = () => {
    if (selectedMessages.length > 0) {
      markMessages(selectedMessages, 'archive')
      setSelectedMessages([])
    }
  }

  const handleDelete = () => {
    if (selectedMessages.length > 0) {
      moveMessages(selectedMessages, 'trash')
      setSelectedMessages([])
    }
  }

  const handleTrustSender = async (email: string) => {
    try {
      await trustSender(email, 'Trusted via mail interface')
    } catch (error) {
      console.error('Failed to trust sender:', error)
    }
  }

  const handleSnooze = (hours: number = 4) => {
    if (selectedMessages.length > 0) {
      const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
      snoozeMessages(selectedMessages, snoozeUntil)
      setSelectedMessages([])
    }
  }

  const selectedMessageData = selectedMessage 
    ? messages.find(m => m.id === selectedMessage)
    : null

  // Show loading state
  if (loading && messages.length === 0) {
    return (
      <div className="mail-layout flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mail-layout">
      {/* Floating Compose Button */}
      <ComposeSheet 
        isOpen={showCompose} 
        onClose={() => setShowCompose(false)}
      >
        <Button 
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 md:bottom-8 md:right-8"
          onClick={() => setShowCompose(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </ComposeSheet>

      {/* Message List Pane */}
      <div className={cn(
        "mail-list-pane",
        showThread && selectedMessage && "hidden md:block"
      )}>
        {/* Search Bar */}
        <div className="mail-search-bar">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`${t('mail.search', 'Search mail')}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Action Bar */}
        {selectedMessages.length > 0 && (
          <div className="mail-action-bar">
            <div className="flex items-center gap-2 p-3 bg-muted/30 border-b">
              <span className="text-sm text-muted-foreground">
                {selectedMessages.length} selected
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={handleMarkRead}>
                  {t('mail.mark_read')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleArchive}>
                  <Archive className="h-4 w-4" />
                  {t('mail.archive')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  {t('mail.delete')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleSnooze(4)}>
                  Snooze 4h
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Category Chips */}
        <div className="mail-categories">
          {categories.map((category) => (
            <Badge key={category} variant="secondary" className="mail-category-chip">
              {category}
            </Badge>
          ))}
        </div>

        {/* Message List */}
        <div className="mail-message-list">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No messages found</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "mail-message-item",
                  selectedMessage === message.id && "selected",
                  !message.isRead && "unread"
                )}
                onClick={() => handleMessageSelect(message.id)}
              >
                <div className="flex items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={selectedMessages.includes(message.id)}
                    onChange={(e) => {
                      e.stopPropagation()
                      setSelectedMessages(prev => 
                        e.target.checked 
                          ? [...prev, message.id]
                          : prev.filter(id => id !== message.id)
                      )
                    }}
                    className="mt-1"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className={cn(
                        "text-sm",
                        !message.isRead && "font-semibold"
                      )}>
                        {message.from.name || message.from.email}
                      </h4>
                      <div className="flex items-center gap-1">
                        {message.isFlagged && <Star className="h-4 w-4 text-yellow-500" />}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.date)}
                        </span>
                      </div>
                    </div>
                    
                    <p className={cn(
                      "text-sm mt-1",
                      !message.isRead && "font-medium"
                    )}>
                      {message.subject}
                    </p>
                    
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {message.preview}
                    </p>
                    
                    {message.labels.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {message.labels.map((label) => (
                          <Badge key={label} variant="outline" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Thread View Pane */}
      {showThread && selectedMessageData && (
        <div className="mail-thread-pane">
          {/* Thread Header */}
          <div className="mail-thread-header">
            <div className="flex items-center gap-3 p-4 border-b">
              <Button 
                variant="ghost" 
                size="icon-sm"
                onClick={handleBackToList}
                className="md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex-1">
                <h2 className="text-lg font-semibold">
                  {selectedMessageData.subject}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedMessageData.date)} at {formatTime(selectedMessageData.date)}
                </p>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={handleArchive}>
                  <Archive className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm">
                  <Star className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Message Content */}
          <div className="mail-message-content">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold">
                    {selectedMessageData.from.name || selectedMessageData.from.email}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedMessageData.from.email}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleTrustSender(selectedMessageData.from.email)}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Trust Sender
                </Button>
              </div>
              
              <div className="prose prose-sm max-w-none">
                {selectedMessageData.htmlBody ? (
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: selectedMessageData.htmlBody 
                    }} 
                  />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {selectedMessageData.body}
                  </div>
                )}
              </div>
              
              {selectedMessageData.attachments && selectedMessageData.attachments.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Attachments</h4>
                  <div className="grid gap-2">
                    {selectedMessageData.attachments.map((attachment) => (
                      <div 
                        key={attachment.id}
                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {attachment.name.split('.').pop()?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{attachment.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reply Actions */}
          <div className="mail-reply-actions">
            <div className="p-4 border-t bg-muted/30">
              <div className="flex gap-2">
                <Button>{t('mail.reply')}</Button>
                <Button variant="outline">Reply All</Button>
                <Button variant="outline">{t('mail.forward')}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
