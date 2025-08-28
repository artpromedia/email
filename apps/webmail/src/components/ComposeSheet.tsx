import { useState, ReactNode, useEffect } from 'react'
import { X, Paperclip, Send, Smile, Bold, Italic, Underline, Link2, Clock, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { useMail } from '../hooks/useMail'
import { useI18n } from '../contexts/I18nContext'
import toast from 'react-hot-toast'

interface ComposeSheetProps {
  isOpen: boolean
  onClose: () => void
  children?: ReactNode
}

interface Contact {
  name: string
  email: string
}

const suggestions: Contact[] = [
  { name: 'Sarah Chen', email: 'sarah@acme.com' },
  { name: 'Alex Rodriguez', email: 'alex@techcorp.io' },
  { name: 'Maria Santos', email: 'maria@designstudio.com' },
  { name: 'David Kim', email: 'david@startup.co' },
  { name: 'Lisa Wang', email: 'lisa@agency.com' },
]

export function ComposeSheet({ isOpen, onClose, children }: ComposeSheetProps) {
  const [toContacts, setToContacts] = useState<Contact[]>([])
  const [ccContacts, setCcContacts] = useState<Contact[]>([])
  const [bccContacts, setBccContacts] = useState<Contact[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [toInput, setToInput] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [bccInput, setBccInput] = useState('')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestions, setActiveSuggestions] = useState<Contact[]>([])
  const [isSending, setIsSending] = useState(false)
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [scheduledSend, setScheduledSend] = useState<string>('')
  
  const { sendMessage, saveDraft } = useMail()
  const { t } = useI18n()

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (!isOpen || (!subject && !content)) return

    const interval = setInterval(() => {
      if (toContacts.length > 0 || subject || content) {
        handleSaveDraft()
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [isOpen, toContacts, subject, content])

  const handleSaveDraft = async () => {
    try {
      await saveDraft({
        to: toContacts.map(c => c.email),
        cc: ccContacts.map(c => c.email),
        bcc: bccContacts.map(c => c.email),
        subject,
        body: content,
      })
    } catch (error) {
      // Silent fail for auto-save
      console.error('Auto-save failed:', error)
    }
  }
      setShowSuggestions(false)
    }
  }

  const addContact = (contact: Contact, type: 'to' | 'cc' | 'bcc') => {
    if (type === 'to') {
      setToContacts([...toContacts, contact])
      setToInput('')
    } else if (type === 'cc') {
      setCcContacts([...ccContacts, contact])
      setCcInput('')
    } else {
      setBccContacts([...bccContacts, contact])
      setBccInput('')
    }
    setShowSuggestions(false)
  }

  const removeContact = (index: number, type: 'to' | 'cc' | 'bcc') => {
    if (type === 'to') {
      setToContacts(toContacts.filter((_, i) => i !== index))
    } else if (type === 'cc') {
      setCcContacts(ccContacts.filter((_, i) => i !== index))
    } else {
      setBccContacts(bccContacts.filter((_, i) => i !== index))
    }
  }

  const handleSend = () => {
    console.log('Sending email:', {
      to: toContacts,
      cc: ccContacts,
      bcc: bccContacts,
      subject,
      content
    })
    onClose()
  }

  const ContactChip = ({ contact, onRemove }: { contact: Contact; onRemove: () => void }) => (
    <Badge variant="secondary" className="flex items-center gap-1 pr-1">
      <span className="truncate max-w-32">{contact.name}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  )

  const ContactInput = ({ 
    value, 
    onChange, 
    placeholder, 
    contacts, 
    onRemoveContact, 
    type 
  }: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    contacts: Contact[]
    onRemoveContact: (index: number) => void
    type: 'to' | 'cc' | 'bcc'
  }) => (
    <div className="flex flex-wrap items-center gap-1 p-2 border rounded-md min-h-10">
      {contacts.map((contact, index) => (
        <ContactChip
          key={index}
          contact={contact}
          onRemove={() => onRemoveContact(index)}
        />
      ))}
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          if (type === 'to') handleToInputChange(e.target.value)
        }}
        placeholder={contacts.length === 0 ? placeholder : ''}
        className="border-0 shadow-none flex-1 min-w-32 p-0 h-6"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.includes('@')) {
            e.preventDefault()
            const email = value.trim()
            const contact = { name: email.split('@')[0], email }
            addContact(contact, type)
          }
        }}
      />
    </div>
  )

  if (!isOpen) return <>{children}</>

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Compose</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Recipients */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-12">To</label>
              <div className="flex-1 relative">
                <ContactInput
                  value={toInput}
                  onChange={setToInput}
                  placeholder="Enter email addresses"
                  contacts={toContacts}
                  onRemoveContact={(index) => removeContact(index, 'to')}
                  type="to"
                />
                {showSuggestions && activeSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-background border rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                    {activeSuggestions.map((contact, index) => (
                      <div
                        key={index}
                        className="p-2 hover:bg-muted cursor-pointer"
                        onClick={() => addContact(contact, 'to')}
                      >
                        <div className="font-medium">{contact.name}</div>
                        <div className="text-sm text-muted-foreground">{contact.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowCc(!showCc)}
                >
                  Cc
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowBcc(!showBcc)}
                >
                  Bcc
                </Button>
              </div>
            </div>

            {showCc && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-12">Cc</label>
                <ContactInput
                  value={ccInput}
                  onChange={setCcInput}
                  placeholder="Carbon copy"
                  contacts={ccContacts}
                  onRemoveContact={(index) => removeContact(index, 'cc')}
                  type="cc"
                />
              </div>
            )}

            {showBcc && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-12">Bcc</label>
                <ContactInput
                  value={bccInput}
                  onChange={setBccInput}
                  placeholder="Blind carbon copy"
                  contacts={bccContacts}
                  onRemoveContact={(index) => removeContact(index, 'bcc')}
                  type="bcc"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-12">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="flex-1"
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 border-b">
            <Button variant="ghost" size="sm">
              <Bold className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Italic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Underline className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button variant="ghost" size="sm">
              <Link2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Smile className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button variant="ghost" size="sm">
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message..."
              className="w-full h-full p-3 border-0 resize-none focus:outline-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t bg-muted/30">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-2" />
                Schedule Send
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Save Draft
              </Button>
              <Button onClick={handleSend} disabled={toContacts.length === 0 || !subject.trim()}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
