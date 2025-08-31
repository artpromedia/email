import { useState, useEffect, useRef } from "react";
import {
  Send,
  Paperclip,
  Smile,
  Search,
  Plus,
  Phone,
  Video,
  MoreVertical,
  Settings,
  Users,
  Hash,
  AtSign,
  Share,
  Edit3,
  Trash2,
  Reply,
  Archive,
  Pin,
  Bell,
  BellOff,
  Download,
  X,
  Check,
  CheckCheck,
  Circle,
  Minus,
  User,
  Crown,
  Shield,
  Calendar,
  Link,
  Image,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// Types
interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  presence: {
    status: "online" | "away" | "busy" | "offline";
    customMessage?: string;
    lastSeen: Date;
    isActive: boolean;
  };
  role?: "owner" | "admin" | "member";
  isExternal?: boolean;
}

interface Conversation {
  id: string;
  name: string;
  description?: string;
  type: "dm" | "room";
  avatar?: string;
  isExternal: boolean;
  members: User[];
  lastMessage?: Message;
  unreadCount: number;
  mentionCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isTyping: string[]; // user IDs currently typing
  retentionPolicy?: {
    enabled: boolean;
    retentionDays: number;
    badge: "none" | "7days" | "30days" | "90days" | "365days";
  };
  settings: {
    notifications: "all" | "mentions" | "none";
    soundEnabled: boolean;
    theme: "default" | "dark" | "light";
  };
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: "text" | "system" | "file" | "image" | "link";
  mentions: Mention[];
  attachments: Attachment[];
  reactions: Reaction[];
  replyTo?: string;
  isEdited: boolean;
  editHistory: MessageEdit[];
  isDeleted: boolean;
  deletedAt?: Date;
  readBy: MessageRead[];
  createdAt: Date;
  updatedAt: Date;
}

interface Mention {
  userId: string;
  userName: string;
  offset: number;
  length: number;
}

interface Attachment {
  id: string;
  name: string;
  type: "image" | "document" | "video" | "audio" | "other";
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: Date;
}

interface Reaction {
  emoji: string;
  userId: string;
  userName: string;
  createdAt: Date;
}

interface MessageEdit {
  content: string;
  editedAt: Date;
  editedBy: string;
}

interface MessageRead {
  userId: string;
  readAt: Date;
}

// Sample data
const currentUser: User = {
  id: "user-1",
  name: "You",
  email: "you@company.com",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=you",
  presence: {
    status: "online",
    lastSeen: new Date(),
    isActive: true,
  },
};

const sampleUsers: User[] = [
  {
    id: "user-2",
    name: "Alice Johnson",
    email: "alice@company.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
    presence: {
      status: "online",
      lastSeen: new Date(),
      isActive: true,
    },
    role: "admin",
  },
  {
    id: "user-3",
    name: "Bob Smith",
    email: "bob@company.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
    presence: {
      status: "away",
      lastSeen: new Date(Date.now() - 300000),
      isActive: false,
    },
    role: "member",
  },
  {
    id: "user-4",
    name: "Carol Davis",
    email: "carol@external.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=carol",
    presence: {
      status: "offline",
      lastSeen: new Date(Date.now() - 3600000),
      isActive: false,
    },
    role: "member",
    isExternal: true,
  },
];

export function ChatPage() {
  const { toast } = useToast();

  // Chat state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentDialog, setShowAttachmentDialog] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedMessageForShare, setSelectedMessageForShare] =
    useState<Message | null>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] =
    useState(false);
  const [showConversationSettings, setShowConversationSettings] =
    useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize sample data
  useEffect(() => {
    const sampleConversations: Conversation[] = [
      {
        id: "conv-1",
        name: "Alice Johnson",
        type: "dm",
        isExternal: false,
        members: [currentUser, sampleUsers[0]],
        unreadCount: 2,
        mentionCount: 0,
        isMuted: false,
        isPinned: true,
        isTyping: [],
        settings: {
          notifications: "all",
          soundEnabled: true,
          theme: "default",
        },
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 600000),
        lastMessage: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: sampleUsers[0].id,
          senderName: sampleUsers[0].name,
          senderAvatar: sampleUsers[0].avatar,
          content: "Can you review the latest design specs?",
          type: "text",
          mentions: [],
          attachments: [],
          reactions: [],
          isEdited: false,
          editHistory: [],
          isDeleted: false,
          readBy: [],
          createdAt: new Date(Date.now() - 600000),
          updatedAt: new Date(Date.now() - 600000),
        },
      },
      {
        id: "conv-2",
        name: "Project Team",
        description: "Main project coordination channel",
        type: "room",
        isExternal: true,
        members: [currentUser, ...sampleUsers],
        unreadCount: 5,
        mentionCount: 1,
        isMuted: false,
        isPinned: false,
        isTyping: [sampleUsers[1].id],
        retentionPolicy: {
          enabled: true,
          retentionDays: 30,
          badge: "30days",
        },
        settings: {
          notifications: "mentions",
          soundEnabled: true,
          theme: "default",
        },
        createdAt: new Date(Date.now() - 604800000),
        updatedAt: new Date(Date.now() - 300000),
        lastMessage: {
          id: "msg-2",
          conversationId: "conv-2",
          senderId: sampleUsers[1].id,
          senderName: sampleUsers[1].name,
          senderAvatar: sampleUsers[1].avatar,
          content: "The client meeting is scheduled for tomorrow at 2 PM",
          type: "text",
          mentions: [],
          attachments: [],
          reactions: [
            {
              emoji: "👍",
              userId: currentUser.id,
              userName: currentUser.name,
              createdAt: new Date(Date.now() - 250000),
            },
          ],
          isEdited: false,
          editHistory: [],
          isDeleted: false,
          readBy: [
            {
              userId: currentUser.id,
              readAt: new Date(Date.now() - 200000),
            },
          ],
          createdAt: new Date(Date.now() - 300000),
          updatedAt: new Date(Date.now() - 300000),
        },
      },
    ];

    setConversations(sampleConversations);
    setSelectedConversation(sampleConversations[0]);
  }, []);

  // Load messages for selected conversation
  useEffect(() => {
    if (selectedConversation) {
      // In a real app, this would fetch from API
      const sampleMessages: Message[] = [
        {
          id: "msg-1",
          conversationId: selectedConversation.id,
          senderId: selectedConversation.members[1].id,
          senderName: selectedConversation.members[1].name,
          senderAvatar: selectedConversation.members[1].avatar,
          content: "Hey! How's the project coming along?",
          type: "text",
          mentions: [],
          attachments: [],
          reactions: [],
          isEdited: false,
          editHistory: [],
          isDeleted: false,
          readBy: [
            {
              userId: currentUser.id,
              readAt: new Date(Date.now() - 1800000),
            },
          ],
          createdAt: new Date(Date.now() - 3600000),
          updatedAt: new Date(Date.now() - 3600000),
        },
        {
          id: "msg-2",
          conversationId: selectedConversation.id,
          senderId: currentUser.id,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar,
          content:
            "Going well! Just finished the wireframes. @Alice Johnson what do you think about the new layout?",
          type: "text",
          mentions: [
            {
              userId: selectedConversation.members[1].id,
              userName: selectedConversation.members[1].name,
              offset: 53,
              length: 13,
            },
          ],
          attachments: [],
          reactions: [
            {
              emoji: "🎉",
              userId: selectedConversation.members[1].id,
              userName: selectedConversation.members[1].name,
              createdAt: new Date(Date.now() - 1500000),
            },
          ],
          isEdited: false,
          editHistory: [],
          isDeleted: false,
          readBy: [
            {
              userId: selectedConversation.members[1].id,
              readAt: new Date(Date.now() - 1500000),
            },
          ],
          createdAt: new Date(Date.now() - 1800000),
          updatedAt: new Date(Date.now() - 1800000),
        },
        {
          id: "msg-3",
          conversationId: selectedConversation.id,
          senderId: selectedConversation.members[1].id,
          senderName: selectedConversation.members[1].name,
          senderAvatar: selectedConversation.members[1].avatar,
          content: "Looks fantastic! The user flow is much clearer now.",
          type: "text",
          mentions: [],
          attachments: [],
          reactions: [],
          isEdited: false,
          editHistory: [],
          isDeleted: false,
          readBy: [],
          createdAt: new Date(Date.now() - 600000),
          updatedAt: new Date(Date.now() - 600000),
        },
      ];
      setMessages(sampleMessages);
    }
  }, [selectedConversation]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message sending
  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId: selectedConversation.id,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      content: messageInput,
      type: "text",
      mentions: extractMentions(messageInput),
      attachments: [],
      reactions: [],
      replyTo: replyingTo?.id,
      isEdited: false,
      editHistory: [],
      isDeleted: false,
      readBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (editingMessage) {
      // Handle message editing
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === editingMessage.id
            ? {
                ...msg,
                content: messageInput,
                isEdited: true,
                editHistory: [
                  ...msg.editHistory,
                  {
                    content: msg.content,
                    editedAt: new Date(),
                    editedBy: currentUser.id,
                  },
                ],
                updatedAt: new Date(),
              }
            : msg,
        ),
      );
      setEditingMessage(null);
      toast({
        title: "Message updated",
        description: "Your message has been updated successfully.",
      });
    } else {
      // Handle new message
      setMessages((prev) => [...prev, newMessage]);

      // Update conversation last message
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversation.id
            ? { ...conv, lastMessage: newMessage, updatedAt: new Date() }
            : conv,
        ),
      );

      // Simulate real-time delivery
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === newMessage.id
              ? {
                  ...msg,
                  readBy: [
                    ...msg.readBy,
                    { userId: currentUser.id, readAt: new Date() },
                  ],
                }
              : msg,
          ),
        );
      }, 1000);
    }

    setMessageInput("");
    setReplyingTo(null);
  };

  // Extract mentions from message content
  const extractMentions = (content: string): Mention[] => {
    const mentions: Mention[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const userName = match[1];
      const user = selectedConversation?.members.find((m) =>
        m.name.toLowerCase().includes(userName.toLowerCase()),
      );

      if (user) {
        mentions.push({
          userId: user.id,
          userName: user.name,
          offset: match.index,
          length: match[0].length,
        });
      }
    }

    return mentions;
  };

  // Handle typing indicator
  useEffect(() => {
    if (messageInput && !isTyping) {
      setIsTyping(true);
      // In real app, send typing indicator to server
    }

    const timer = setTimeout(() => {
      setIsTyping(false);
      // In real app, stop typing indicator
    }, 3000);

    return () => clearTimeout(timer);
  }, [messageInput]);

  // Handle message sharing to email
  const handleShareToEmail = (message: Message) => {
    setSelectedMessageForShare(message);
    setShowShareDialog(true);
  };

  const handleConfirmShareToEmail = (recipients: string[], subject: string) => {
    if (!selectedMessageForShare) return;

    // Create email draft with quoted message
    const quotedContent = `
Original message from ${selectedMessageForShare.senderName} at ${selectedMessageForShare.createdAt.toLocaleString()}:

> ${selectedMessageForShare.content}

${selectedMessageForShare.attachments.length > 0 ? `\nAttachments: ${selectedMessageForShare.attachments.map((a) => a.name).join(", ")}` : ""}
    `;

    // In real app, this would create an email draft via API
    toast({
      title: "Draft created",
      description: `Email draft created with shared message. Recipients: ${recipients.join(", ")}`,
    });

    setShowShareDialog(false);
    setSelectedMessageForShare(null);
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter(
    (conv) =>
      conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage?.content
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  // Get presence indicator color
  const getPresenceColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "away":
        return "bg-yellow-500";
      case "busy":
        return "bg-red-500";
      case "offline":
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  // Format message timestamp
  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (diffInHours < 168) {
      // 7 days
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // Render message content with mentions
  const renderMessageContent = (message: Message) => {
    let content = message.content;
    let offset = 0;

    const elements: (string | React.ReactElement)[] = [];

    message.mentions.forEach((mention, index) => {
      // Add text before mention
      if (mention.offset > offset) {
        elements.push(content.slice(offset, mention.offset));
      }

      // Add mention element
      elements.push(
        <Badge key={`mention-${index}`} variant="secondary" className="mx-1">
          @{mention.userName}
        </Badge>,
      );

      offset = mention.offset + mention.length;
    });

    // Add remaining text
    if (offset < content.length) {
      elements.push(content.slice(offset));
    }

    return elements.length > 0 ? elements : content;
  };

  return (
    <div className="h-full flex">
      {/* Sidebar - Conversations List */}
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Chat</h1>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewConversationDialog(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation)}
              className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedConversation?.id === conversation.id ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={
                        conversation.avatar || conversation.members[1]?.avatar
                      }
                    />
                    <AvatarFallback>
                      {conversation.type === "room" ? (
                        <Hash className="h-5 w-5" />
                      ) : (
                        conversation.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {conversation.type === "dm" && conversation.members[1] && (
                    <div
                      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${getPresenceColor(
                        conversation.members[1].presence.status,
                      )}`}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">
                        {conversation.name}
                      </h3>
                      {conversation.isPinned && (
                        <Pin className="h-3 w-3 text-muted-foreground" />
                      )}
                      {conversation.isMuted && (
                        <BellOff className="h-3 w-3 text-muted-foreground" />
                      )}
                      {conversation.isExternal && (
                        <Badge variant="outline" className="text-xs">
                          External
                        </Badge>
                      )}
                      {conversation.retentionPolicy?.enabled && (
                        <Badge variant="secondary" className="text-xs">
                          {conversation.retentionPolicy.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {conversation.unreadCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                      {conversation.mentionCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          @{conversation.mentionCount}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {conversation.isTyping.length > 0 ? (
                      <span className="italic text-green-600">
                        {conversation.isTyping.length === 1
                          ? "Someone is"
                          : `${conversation.isTyping.length} people are`}{" "}
                        typing...
                      </span>
                    ) : (
                      conversation.lastMessage?.content || "No messages yet"
                    )}
                  </p>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {conversation.lastMessage &&
                        formatMessageTime(conversation.lastMessage.createdAt)}
                    </span>
                    {conversation.type === "room" && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {conversation.members.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={
                        selectedConversation.avatar ||
                        selectedConversation.members[1]?.avatar
                      }
                    />
                    <AvatarFallback>
                      {selectedConversation.type === "room" ? (
                        <Hash className="h-5 w-5" />
                      ) : (
                        selectedConversation.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {selectedConversation.type === "dm" &&
                    selectedConversation.members[1] && (
                      <div
                        className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${getPresenceColor(
                          selectedConversation.members[1].presence.status,
                        )}`}
                      />
                    )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">
                      {selectedConversation.name}
                    </h2>
                    {selectedConversation.isExternal && (
                      <Badge variant="outline" className="text-xs">
                        External
                      </Badge>
                    )}
                  </div>
                  {selectedConversation.type === "dm" &&
                  selectedConversation.members[1] ? (
                    <p className="text-sm text-muted-foreground">
                      {selectedConversation.members[1].presence.status ===
                      "online"
                        ? "Active now"
                        : `Last seen ${formatMessageTime(selectedConversation.members[1].presence.lastSeen)}`}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {selectedConversation.members.length} members
                      {selectedConversation.description &&
                        ` • ${selectedConversation.description}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedConversation.type === "dm" && (
                  <>
                    <Button size="sm" variant="outline">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline">
                      <Video className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowConversationSettings(true)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Users className="mr-2 h-4 w-4" />
                      Members
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Search className="mr-2 h-4 w-4" />
                      Search in conversation
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      {selectedConversation.isMuted ? (
                        <>
                          <Bell className="mr-2 h-4 w-4" />
                          Unmute
                        </>
                      ) : (
                        <>
                          <BellOff className="mr-2 h-4 w-4" />
                          Mute
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      {selectedConversation.isPinned ? (
                        <>
                          <Minus className="mr-2 h-4 w-4" />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-4 w-4" />
                          Pin
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Archive className="mr-2 h-4 w-4" />
                      Archive conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => {
              const showSender =
                index === 0 ||
                messages[index - 1].senderId !== message.senderId;
              const isOwnMessage = message.senderId === currentUser.id;

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 group ${isOwnMessage ? "justify-end" : ""}`}
                >
                  {!isOwnMessage && showSender && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={message.senderAvatar} />
                      <AvatarFallback>
                        {message.senderName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  {!isOwnMessage && !showSender && <div className="w-8" />}

                  <div
                    className={`flex-1 ${isOwnMessage ? "flex justify-end" : ""}`}
                  >
                    <div
                      className={`max-w-[70%] ${isOwnMessage ? "order-2" : ""}`}
                    >
                      {showSender && !isOwnMessage && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {message.senderName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(message.createdAt)}
                          </span>
                        </div>
                      )}

                      {message.replyTo && (
                        <div className="mb-2 p-2 border-l-4 border-muted bg-muted/30 rounded text-sm">
                          <div className="text-muted-foreground">
                            Replying to{" "}
                            {
                              messages.find((m) => m.id === message.replyTo)
                                ?.senderName
                            }
                          </div>
                          <div className="truncate">
                            {
                              messages.find((m) => m.id === message.replyTo)
                                ?.content
                            }
                          </div>
                        </div>
                      )}

                      <div
                        className={`p-3 rounded-lg ${
                          isOwnMessage
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="break-words">
                          {renderMessageContent(message)}
                        </div>

                        {message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center gap-2 p-2 rounded border"
                              >
                                {attachment.type === "image" ? (
                                  <Image className="h-4 w-4" />
                                ) : (
                                  <File className="h-4 w-4" />
                                )}
                                <span className="text-sm">
                                  {attachment.name}
                                </span>
                                <Button size="sm" variant="ghost">
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            {message.reactions.map((reaction, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-xs"
                              >
                                {reaction.emoji} {reaction.userName}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {message.isEdited && <span>(edited)</span>}
                            {isOwnMessage && (
                              <div className="flex items-center gap-1">
                                {message.readBy.length > 0 ? (
                                  <CheckCheck className="h-3 w-3" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                {isOwnMessage &&
                                  formatMessageTime(message.createdAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Message Actions */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ml-2 ${
                        isOwnMessage ? "order-1 mr-2 ml-0" : ""
                      }`}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setReplyingTo(message)}
                          >
                            <Reply className="mr-2 h-4 w-4" />
                            Reply
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleShareToEmail(message)}
                          >
                            <Share className="mr-2 h-4 w-4" />
                            Share to email
                          </DropdownMenuItem>
                          {isOwnMessage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingMessage(message);
                                  setMessageInput(message.content);
                                  messageInputRef.current?.focus();
                                }}
                              >
                                <Edit3 className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Area */}
          <div className="p-4 border-t">
            {replyingTo && (
              <div className="mb-3 p-2 bg-muted rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Reply className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Replying to <strong>{replyingTo.senderName}</strong>:{" "}
                    {replyingTo.content.substring(0, 50)}...
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReplyingTo(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {editingMessage && (
              <div className="mb-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">Editing message</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingMessage(null);
                    setMessageInput("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAttachmentDialog(true)}
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <div className="flex-1 relative">
                <Textarea
                  ref={messageInputRef}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message ${selectedConversation.name}...`}
                  className="min-h-[40px] max-h-32 resize-none pr-20"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <AtSign className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Welcome to Chat</h2>
            <p className="text-muted-foreground">
              Select a conversation to start messaging
            </p>
          </div>
        </div>
      )}

      {/* Share to Email Dialog */}
      {showShareDialog && selectedMessageForShare && (
        <ShareToEmailDialog
          message={selectedMessageForShare}
          onClose={() => setShowShareDialog(false)}
          onConfirm={handleConfirmShareToEmail}
        />
      )}

      {/* File input for attachments */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          console.log("Selected files:", files);
          // Handle file upload
        }}
      />
    </div>
  );
}

// Share to Email Dialog Component
function ShareToEmailDialog({
  message,
  onClose,
  onConfirm,
}: {
  message: Message;
  onClose: () => void;
  onConfirm: (recipients: string[], subject: string) => void;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [subject, setSubject] = useState(
    `Shared message from ${message.senderName}`,
  );

  const addRecipient = () => {
    if (recipientInput.trim() && !recipients.includes(recipientInput.trim())) {
      setRecipients([...recipients, recipientInput.trim()]);
      setRecipientInput("");
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share to Email</DialogTitle>
          <DialogDescription>
            Share this message as an email draft
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message Preview */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-1">{message.senderName}</div>
            <div className="text-sm">{message.content}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {message.createdAt.toLocaleString()}
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex gap-2">
              <Input
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="Enter email address"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
              />
              <Button onClick={addRecipient} disabled={!recipientInput.trim()}>
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {recipients.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1">
                  {email}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeRecipient(email)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(recipients, subject)}
            disabled={recipients.length === 0 || !subject.trim()}
          >
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ChatPage;
