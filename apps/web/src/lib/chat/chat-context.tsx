"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  parent_id?: string;
  content: string;
  content_type: "text" | "markdown" | "system" | "code";
  is_edited: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  user?: User;
  attachments?: Attachment[];
  reactions?: Reaction[];
  reply_count?: number;
}

export interface Channel {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string;
  type: "public" | "private" | "direct";
  topic: string;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
  unread_count?: number;
  last_message_at?: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  status: "online" | "away" | "dnd" | "offline";
  status_text?: string;
  last_seen_at: string;
}

export interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  url: string;
  thumbnail_url?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: User[];
}

export interface Presence {
  user_id: string;
  status: string;
  status_text?: string;
  last_seen_at: string;
}

export interface ChatEvent {
  type:
    | "message"
    | "message_update"
    | "message_delete"
    | "typing"
    | "presence"
    | "reaction"
    | "channel_update";
  channel_id?: string;
  payload: unknown;
  timestamp: string;
}

interface ChatContextType {
  // Connection
  isConnected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;

  // Channels
  channels: Channel[];
  currentChannel: Channel | null;
  setCurrentChannel: (channel: Channel | null) => void;
  createChannel: (name: string, description: string, isPrivate: boolean) => Promise<Channel>;
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: (channelId: string) => Promise<void>;

  // Messages
  messages: Message[];
  sendMessage: (content: string, parentId?: string) => Promise<Message>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  pinMessage: (messageId: string) => Promise<void>;
  unpinMessage: (messageId: string) => Promise<void>;

  // Reactions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;

  // Typing
  typingUsers: Map<string, string[]>;
  sendTyping: (channelId: string, isTyping: boolean) => void;

  // Presence
  onlineUsers: string[];

  // Users
  users: User[];

  // Direct Messages
  startDirectMessage: (userId: string) => Promise<Channel>;

  // Search
  searchMessages: (query: string) => Promise<Message[]>;

  // Loading states
  isLoading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CHAT_API_URL = process.env["NEXT_PUBLIC_CHAT_API_URL"] || "http://localhost:8086";
const CHAT_WS_URL = process.env["NEXT_PUBLIC_CHAT_WS_URL"] || "ws://localhost:8086/ws";

export function ChatProvider({
  children,
  token,
}: Readonly<{ children: ReactNode; token: string }>) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // API helper
  const api = useCallback(
    async <T,>(endpoint: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(`${CHAT_API_URL}/api/v1${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers as Record<string, string>),
        },
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "API request failed");
      }

      if (response.status === 204) {
        return {} as T;
      }

      return response.json() as Promise<T>;
    },
    [token]
  );

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (event: ChatEvent) => {
      switch (event.type) {
        case "message": {
          const newMessage = event.payload as Message;
          if (newMessage.channel_id === currentChannel?.id) {
            setMessages((prev) => [...prev, newMessage]);
          }
          // Update channel's unread count
          setChannels((prev) =>
            prev.map((ch) =>
              ch.id === newMessage.channel_id && ch.id !== currentChannel?.id
                ? { ...ch, unread_count: (ch.unread_count ?? 0) + 1 }
                : ch
            )
          );
          break;
        }

        case "message_update": {
          const updatedMessage = event.payload as Message;
          setMessages((prev) => prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)));
          break;
        }

        case "message_delete": {
          const deletedMessage = event.payload as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
          break;
        }

        case "typing": {
          const typingData = event.payload as { user_id: string; is_typing: boolean };
          const channelId = event.channel_id;
          if (channelId) {
            setTypingUsers((prev) => {
              const newMap = new Map(prev);
              const channelTyping = newMap.get(channelId) ?? [];

              if (typingData.is_typing) {
                if (!channelTyping.includes(typingData.user_id)) {
                  newMap.set(channelId, [...channelTyping, typingData.user_id]);
                }
              } else {
                newMap.set(
                  channelId,
                  channelTyping.filter((id) => id !== typingData.user_id)
                );
              }

              return newMap;
            });
          }
          break;
        }

        case "presence": {
          const presence = event.payload as Presence;
          if (presence.status === "online") {
            setOnlineUsers((prev) =>
              prev.includes(presence.user_id) ? prev : [...prev, presence.user_id]
            );
          } else {
            setOnlineUsers((prev) => prev.filter((id) => id !== presence.user_id));
          }
          break;
        }

        case "reaction":
          // Handle reaction updates
          break;

        case "channel_update": {
          const updatedChannel = event.payload as Channel;
          setChannels((prev) =>
            prev.map((ch) => (ch.id === updatedChannel.id ? updatedChannel : ch))
          );
          break;
        }
      }
    },
    [currentChannel]
  );

  // WebSocket connection
  const connect = useCallback(
    (authToken: string) => {
      if (ws) {
        ws.close();
      }

      const websocket = new WebSocket(`${CHAT_WS_URL}?token=${authToken}`);

      websocket.onopen = () => {
        setIsConnected(true);
        console.info("Chat WebSocket connected");
      };

      websocket.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as ChatEvent;
          handleWebSocketMessage(data);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to parse WebSocket message:", errorMessage);
        }
      };

      websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      websocket.onclose = () => {
        setIsConnected(false);
        console.info("Chat WebSocket disconnected");

        // Reconnect after 3 seconds
        setTimeout(() => {
          connect(authToken);
        }, 3000);
      };

      setWs(websocket);
    },
    [ws, handleWebSocketMessage]
  );

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);

  // Load channels on mount
  useEffect(() => {
    const loadChannels = async () => {
      setIsLoading(true);
      try {
        const response = await api<{ channels: Channel[] }>("/channels/joined");
        setChannels(response.channels);
      } catch (err) {
        console.error("Failed to load channels:", err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadChannels();
  }, [api]);

  // Load messages when channel changes
  useEffect(() => {
    if (!currentChannel) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const response = await api<{ messages: Message[] }>(
          `/channels/${currentChannel.id}/messages`
        );
        setMessages(response.messages);

        // Mark as read
        await api(`/channels/${currentChannel.id}/read`, { method: "POST" });

        // Subscribe to channel
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "subscribe", channel_id: currentChannel.id }));
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadMessages();

    return () => {
      // Unsubscribe when leaving channel
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", channel_id: currentChannel.id }));
      }
    };
  }, [currentChannel, api, ws]);

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await api<{ users: User[] }>("/users");
        setUsers(response.users);
      } catch (err) {
        console.error("Failed to load users:", err);
      }
    };

    void loadUsers();
  }, [api]);

  // Load presence
  useEffect(() => {
    const loadPresence = async () => {
      try {
        const response = await api<{ presences: Presence[] }>("/users/presence");
        setOnlineUsers(response.presences.map((p) => p.user_id));
      } catch (err) {
        console.error("Failed to load presence:", err);
      }
    };

    void loadPresence();
  }, [api]);

  // Connect WebSocket - intentionally only depends on token to avoid reconnection loops
  useEffect(() => {
    if (token) {
      connect(token);
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Channel operations
  const createChannel = async (name: string, description: string, isPrivate: boolean) => {
    const channel = await api<Channel>("/channels", {
      method: "POST",
      body: JSON.stringify({ name, description, is_private: isPrivate }),
    });
    setChannels((prev) => [...prev, channel]);
    return channel;
  };

  const joinChannel = async (channelId: string) => {
    await api(`/channels/${channelId}/join`, { method: "POST" });
    const channel = await api<Channel>(`/channels/${channelId}`);
    setChannels((prev) => [...prev, channel]);
  };

  const leaveChannel = async (channelId: string) => {
    await api(`/channels/${channelId}/leave`, { method: "POST" });
    setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
    if (currentChannel?.id === channelId) {
      setCurrentChannel(null);
    }
  };

  // Message operations
  const sendMessage = async (content: string, parentId?: string) => {
    if (!currentChannel) throw new Error("No channel selected");

    const message = await api<Message>(`/channels/${currentChannel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, parent_id: parentId }),
    });

    return message;
  };

  const editMessage = async (messageId: string, content: string) => {
    await api(`/messages/${messageId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  };

  const deleteMessage = async (messageId: string) => {
    await api(`/messages/${messageId}`, { method: "DELETE" });
  };

  const pinMessage = async (messageId: string) => {
    await api(`/messages/${messageId}/pin`, { method: "POST" });
  };

  const unpinMessage = async (messageId: string) => {
    await api(`/messages/${messageId}/pin`, { method: "DELETE" });
  };

  // Reactions
  const addReaction = async (messageId: string, emoji: string) => {
    await api(`/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  };

  const removeReaction = async (messageId: string, emoji: string) => {
    await api(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: "DELETE",
    });
  };

  // Typing indicator
  const sendTyping = useCallback(
    (channelId: string, isTyping: boolean) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "typing",
            channel_id: channelId,
            payload: { is_typing: isTyping },
          })
        );
      }
    },
    [ws]
  );

  // Direct messages
  const startDirectMessage = async (userId: string) => {
    const channel = await api<Channel>("/dm", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    setChannels((prev) => {
      if (prev.some((ch) => ch.id === channel.id)) return prev;
      return [...prev, channel];
    });
    return channel;
  };

  // Search
  const searchMessages = async (query: string) => {
    const response = await api<{ messages: Message[] }>(`/search?q=${encodeURIComponent(query)}`);
    return response.messages;
  };

  const contextValue = useMemo(
    () => ({
      isConnected,
      connect,
      disconnect,
      channels,
      currentChannel,
      setCurrentChannel,
      createChannel,
      joinChannel,
      leaveChannel,
      messages,
      sendMessage,
      editMessage,
      deleteMessage,
      pinMessage,
      unpinMessage,
      addReaction,
      removeReaction,
      typingUsers,
      sendTyping,
      onlineUsers,
      users,
      startDirectMessage,
      searchMessages,
      isLoading,
    }),
    [
      isConnected,
      connect,
      disconnect,
      channels,
      currentChannel,
      setCurrentChannel,
      createChannel,
      joinChannel,
      leaveChannel,
      messages,
      sendMessage,
      editMessage,
      deleteMessage,
      pinMessage,
      unpinMessage,
      addReaction,
      removeReaction,
      typingUsers,
      sendTyping,
      onlineUsers,
      users,
      startDirectMessage,
      searchMessages,
      isLoading,
    ]
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
