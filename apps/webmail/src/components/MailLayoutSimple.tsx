import { useState } from 'react'
import { ArrowLeft, Search, Archive, Trash2, Star, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { ComposeSheet } from './ComposeSheet'
import { cn } from '../lib/utils'

export function MailLayout() {
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [showThread, setShowThread] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompose, setShowCompose] = useState(false)

  // Mock data for now
  const messages = [
    {
      id: '1',
      from: 'Sarah Chen',
      subject: 'Q4 Marketing Strategy Review',
      body: 'Hi team, I wanted to share the updated Q4 marketing strategy document...',
      createdAt: new Date().toISOString(),
      isRead: false,
      isFlagged: false,
      attachments: [],
    },
    {
      id: '2',
      from: 'Alex Rodriguez',
      subject: 'Weekly Team Sync',
      body: 'Here\'s a summary of this week\'s team sync...',
      createdAt: new Date().toISOString(),
      isRead: true,
      isFlagged: true,
      attachments: [],
    },
  ]

  const categories = ['Primary', 'Social', 'Promotions', 'Updates']

  const handleMessageSelect = (messageId: string) => {
    setSelectedMessage(messageId)
    setShowThread(true)
  }

  const handleBackToList = () => {
    setShowThread(false)
    setSelectedMessage(null)
  }

  const selectedMessageData = messages.find(m => m.id === selectedMessage)

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
              placeholder="Search mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

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
          {messages.map((message) => (
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "font-medium truncate",
                      !message.isRead && "font-semibold"
                    )}>
                      {message.from}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.createdAt).toLocaleDateString()}
                    </span>
                    {message.isFlagged && <Star className="h-4 w-4 text-yellow-500" />}
                  </div>
                  <div className={cn(
                    "text-sm mb-1 truncate",
                    !message.isRead && "font-medium"
                  )}>
                    {message.subject}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {message.body?.substring(0, 100)}...
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      inbox
                    </Badge>
                    {!message.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Thread View Pane */}
      {showThread && selectedMessageData && (
        <div className="mail-thread-pane">
          {/* Thread Header */}
          <div className="mail-thread-header">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                className="md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h2 className="font-semibold">{selectedMessageData.subject}</h2>
                <p className="text-sm text-muted-foreground">
                  From {selectedMessageData.from} • {new Date(selectedMessageData.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm">
                  <Archive className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Star className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Thread Content */}
          <div className="mail-thread-content">
            <div className="p-6">
              <div className="prose max-w-none">
                <p>{selectedMessageData.body}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
