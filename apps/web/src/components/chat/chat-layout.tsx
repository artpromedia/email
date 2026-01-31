"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Hash,
  Lock,
  Plus,
  Send,
  Smile,
  Paperclip,
  MoreVertical,
  Search,
  Settings,
  Users,
  Pin,
  MessageSquare,
  AtSign,
  Trash2,
  Edit2,
  Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useChat, type Message, type Channel, type User } from "@/lib/chat/chat-context";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatLayout() {
  const { channels, currentChannel, setCurrentChannel, users, onlineUsers, isConnected } =
    useChat();
  const [searchQuery, setSearchQuery] = useState("");

  const publicChannels = channels.filter((ch) => ch.type === "public");
  const privateChannels = channels.filter((ch) => ch.type === "private");
  const directMessages = channels.filter((ch) => ch.type === "direct");

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r">
        {/* Workspace Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Team Chat</h1>
            <div className="flex items-center gap-2">
              <div
                className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")}
              />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Channels List */}
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-3">
            {/* Public Channels */}
            <ChannelSection
              title="Channels"
              channels={publicChannels}
              currentChannel={currentChannel}
              onSelectChannel={setCurrentChannel}
              icon={Hash}
            />

            {/* Private Channels */}
            {privateChannels.length > 0 && (
              <ChannelSection
                title="Private Channels"
                channels={privateChannels}
                currentChannel={currentChannel}
                onSelectChannel={setCurrentChannel}
                icon={Lock}
              />
            )}

            {/* Direct Messages */}
            <DirectMessagesSection
              channels={directMessages}
              currentChannel={currentChannel}
              onSelectChannel={setCurrentChannel}
              users={users}
              onlineUsers={onlineUsers}
            />
          </div>
        </ScrollArea>

        {/* User Profile */}
        <div className="border-t p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Current User</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {currentChannel ? (
          <>
            <ChannelHeader channel={currentChannel} />
            <MessageList />
            <MessageInput />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function ChannelSection({
  title,
  channels,
  currentChannel,
  onSelectChannel,
  icon: Icon,
}: Readonly<{
  title: string;
  channels: Channel[];
  currentChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  icon: typeof Hash;
}>) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { createChannel } = useChat();

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <CreateChannelDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          onCreate={createChannel}
          isPrivate={Icon === Lock}
        />
      </div>
      <div className="space-y-0.5">
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              currentChannel?.id === channel.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{channel.name}</span>
            {channel.unread_count != null && channel.unread_count > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 text-xs">
                {channel.unread_count}
              </Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function DirectMessagesSection({
  channels,
  currentChannel,
  onSelectChannel,
  users,
  onlineUsers,
}: Readonly<{
  channels: Channel[];
  currentChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  users: User[];
  onlineUsers: string[];
}>) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Direct Messages
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-0.5">
        {channels.map((channel) => {
          // For DMs, show the other user
          const otherUser = users.find((u) => u.id !== "current-user-id");
          const isOnline = otherUser && onlineUsers.includes(otherUser.id);

          return (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                currentChannel?.id === channel.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
            >
              <div className="relative">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={otherUser?.avatar_url} />
                  <AvatarFallback className="text-xs">
                    {otherUser?.display_name ? otherUser.display_name[0] : "U"}
                  </AvatarFallback>
                </Avatar>
                {isOnline && (
                  <Circle className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 fill-green-500 text-green-500" />
                )}
              </div>
              <span className="flex-1 truncate text-left">
                {otherUser?.display_name ?? "Unknown User"}
              </span>
              {channel.unread_count != null && channel.unread_count > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 text-xs">
                  {channel.unread_count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateChannelDialog({
  open,
  onOpenChange,
  onCreate,
  isPrivate,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, description: string, isPrivate: boolean) => Promise<Channel>;
  isPrivate: boolean;
}>) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivateChannel, setIsPrivateChannel] = useState(isPrivate);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onCreate(name, description, isPrivateChannel);
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5">
          <Plus className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Channel</DialogTitle>
          <DialogDescription>
            Channels are where your team communicates. They're best organized around a topic.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. marketing"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="What's this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="private">Make private</Label>
              <p className="text-sm text-muted-foreground">
                Only invited members can see this channel
              </p>
            </div>
            <Switch id="private" checked={isPrivateChannel} onCheckedChange={setIsPrivateChannel} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isLoading}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelHeader({ channel }: Readonly<{ channel: Channel }>) {
  const { leaveChannel } = useChat();

  const channelIcon = (() => {
    if (channel.type === "private") {
      return <Lock className="h-5 w-5 text-muted-foreground" />;
    }
    if (channel.type === "direct") {
      return (
        <Avatar className="h-6 w-6">
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
      );
    }
    return <Hash className="h-5 w-5 text-muted-foreground" />;
  })();

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        {channelIcon}
        <div>
          <h2 className="font-semibold">{channel.name}</h2>
          {channel.topic && <p className="text-xs text-muted-foreground">{channel.topic}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <Users className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <Pin className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <Search className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Channel settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => leaveChannel(channel.id)}>
              Leave channel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function MessageList() {
  const { messages, currentChannel, typingUsers, users, isLoading } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  const channelTyping = currentChannel ? (typingUsers.get(currentChannel.id) ?? []) : [];
  const typingUserNames = channelTyping
    .map((id) => users.find((u) => u.id === id)?.display_name ?? "Someone")
    .filter(Boolean);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 p-4">
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-1 font-semibold">No messages yet</h3>
            <p className="text-sm text-muted-foreground">
              Be the first to send a message in this channel!
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              showAvatar={index === 0 || messages[index - 1].user_id !== message.user_id}
            />
          ))
        )}

        {/* Typing indicator */}
        {typingUserNames.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce delay-100">●</span>
              <span className="animate-bounce delay-200">●</span>
            </div>
            <span>
              {typingUserNames.join(", ")} {typingUserNames.length === 1 ? "is" : "are"} typing...
            </span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function MessageItem({ message, showAvatar }: Readonly<{ message: Message; showAvatar: boolean }>) {
  const { editMessage, deleteMessage, pinMessage, addReaction } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      void editMessage(message.id, editContent);
    }
    setIsEditing(false);
  };

  if (message.content_type === "system") {
    return <div className="py-2 text-center text-sm text-muted-foreground">{message.content}</div>;
  }

  return (
    <div className={cn("group flex gap-3", !showAvatar && "pl-12")}>
      {showAvatar && (
        <Avatar className="mt-0.5 h-9 w-9">
          <AvatarImage src={message.user?.avatar_url} />
          <AvatarFallback>
            {message.user?.display_name ? message.user.display_name[0] : "U"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        {showAvatar && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">
              {message.user?.display_name ?? "Unknown User"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
            {message.is_edited && <span className="text-xs text-muted-foreground">(edited)</span>}
            {message.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
          </div>
        )}

        {isEditing ? (
          <div className="mt-1">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditContent(message.content);
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm hover:bg-muted/80"
              >
                <Paperclip className="h-4 w-4" />
                {attachment.file_name}
              </a>
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => void addReaction(message.id, reaction.emoji)}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm hover:bg-muted/80"
              >
                <span>{reaction.emoji}</span>
                <span className="text-xs text-muted-foreground">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reply count */}
        {message.reply_count && message.reply_count > 0 && (
          <button className="mt-2 text-xs text-primary hover:underline">
            {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {/* Message actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void addReaction(message.id, "👍")}
        >
          <Smile className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MessageSquare className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit message
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void pinMessage(message.id)}>
              <Pin className="mr-2 h-4 w-4" />
              {message.is_pinned ? "Unpin" : "Pin"} message
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => void deleteMessage(message.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete message
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function MessageInput() {
  const { currentChannel, sendMessage, sendTyping } = useChat();
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSend = async () => {
    if (!content.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(content.trim());
      setContent("");
      if (currentChannel) {
        sendTyping(currentChannel.id, false);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleChange = (value: string) => {
    setContent(value);

    // Send typing indicator
    if (currentChannel) {
      sendTyping(currentChannel.id, true);

      // Clear previous timeout - clearTimeout safely handles undefined
      clearTimeout(typingTimeoutRef.current);

      // Stop typing after 3 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(currentChannel.id, false);
      }, 3000);
    }
  };

  if (!currentChannel) return null;

  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2">
        <Button variant="ghost" size="icon">
          <Plus className="h-5 w-5" />
        </Button>
        <div className="relative flex-1">
          <Textarea
            placeholder={`Message #${currentChannel.name}`}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-h-[200px] min-h-[40px] resize-none pr-20"
            rows={1}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Smile className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <AtSign className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button onClick={handleSend} disabled={!content.trim() || isSending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <MessageSquare className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">Welcome to Team Chat</h2>
        <p className="max-w-md text-muted-foreground">
          Select a channel from the sidebar to start chatting with your team, or create a new
          channel to get started.
        </p>
      </div>
    </div>
  );
}
