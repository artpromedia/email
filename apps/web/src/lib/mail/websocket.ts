/**
 * Real-time Mail Updates Hook
 * WebSocket subscriptions for multi-domain mail updates
 */

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mailKeys } from "./api";
import { useMailStore } from "./store";
import type { MailSubscription, MailEvent, UnreadCountUpdate } from "./types";

// ============================================================
// WEBSOCKET CONFIG
// ============================================================

const WS_URL = process.env["NEXT_PUBLIC_WS_URL"] || "ws://localhost:3001";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000;

// ============================================================
// MESSAGE TYPES
// ============================================================

interface WebSocketMessage {
  type: "subscribe" | "unsubscribe" | "heartbeat" | "mail_event" | "unread_update" | "error";
  payload?: unknown;
}

interface MailEventMessage extends WebSocketMessage {
  type: "mail_event";
  payload: MailEvent;
}

interface UnreadUpdateMessage extends WebSocketMessage {
  type: "unread_update";
  payload: UnreadCountUpdate;
}

// ============================================================
// HOOK
// ============================================================

export function useMailWebSocket(enabled = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const {
    activeDomain,
    activeMailbox,
    addEmails,
    updateEmail,
    removeEmails,
    incrementUnreadCount,
    decrementUnreadCount,
    updateUnreadCount,
  } = useMailStore();

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        switch (message.type) {
          case "mail_event": {
            const mailEvent = (message as MailEventMessage).payload;
            handleMailEvent(mailEvent);
            break;
          }
          case "unread_update": {
            const update = (message as UnreadUpdateMessage).payload;
            updateUnreadCount(update);
            break;
          }
          case "heartbeat":
            // Server heartbeat acknowledged
            break;
          case "error":
            console.error("WebSocket error:", message.payload);
            break;
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    },
    [updateUnreadCount]
  );

  // Handle mail events
  const handleMailEvent = useCallback(
    (event: MailEvent) => {
      switch (event.type) {
        case "new":
          // New email received
          if (event.data) {
            addEmails([event.data as Parameters<typeof addEmails>[0][0]]);
            incrementUnreadCount(event.domainId, event.mailboxId, event.folderId);
          }
          // Invalidate queries to refetch
          void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
          break;

        case "read":
          updateEmail(event.emailId, { isRead: true });
          decrementUnreadCount(event.domainId, event.mailboxId, event.folderId);
          break;

        case "unread":
          updateEmail(event.emailId, { isRead: false });
          incrementUnreadCount(event.domainId, event.mailboxId, event.folderId);
          break;

        case "starred":
          updateEmail(event.emailId, { isStarred: true });
          break;

        case "unstarred":
          updateEmail(event.emailId, { isStarred: false });
          break;

        case "moved":
        case "deleted":
          removeEmails([event.emailId]);
          void queryClient.invalidateQueries({ queryKey: mailKeys.emails() });
          void queryClient.invalidateQueries({ queryKey: mailKeys.unreadCounts() });
          break;
      }
    },
    [addEmails, updateEmail, removeEmails, incrementUnreadCount, decrementUnreadCount, queryClient]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.info("WebSocket connected");
        reconnectAttempts.current = 0;

        // Resubscribe to all previous subscriptions
        subscriptionsRef.current.forEach((sub) => {
          sendMessage({ type: "subscribe", payload: JSON.parse(sub) });
        });

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          sendMessage({ type: "heartbeat" });
        }, HEARTBEAT_INTERVAL);
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onclose = () => {
        console.info("WebSocket disconnected");
        cleanup();

        // Attempt reconnection
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          setTimeout(connect, RECONNECT_DELAY * reconnectAttempts.current);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
    }
  }, [handleMessage]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Send message
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Subscribe to mail updates
  const subscribe = useCallback(
    (subscription: MailSubscription) => {
      const key = JSON.stringify(subscription);
      if (!subscriptionsRef.current.has(key)) {
        subscriptionsRef.current.add(key);
        sendMessage({ type: "subscribe", payload: subscription });
      }
    },
    [sendMessage]
  );

  // Unsubscribe from mail updates
  const unsubscribe = useCallback(
    (subscription: MailSubscription) => {
      const key = JSON.stringify(subscription);
      if (subscriptionsRef.current.has(key)) {
        subscriptionsRef.current.delete(key);
        sendMessage({ type: "unsubscribe", payload: subscription });
      }
    },
    [sendMessage]
  );

  // Connect on mount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      cleanup();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect, cleanup]);

  // Subscribe based on active domain/mailbox
  useEffect(() => {
    if (!enabled) return;

    if (activeDomain === "all") {
      // Subscribe to all mailboxes
      subscribe({ type: "all" });
    } else if (activeMailbox) {
      // Subscribe to specific mailbox
      subscribe({ type: "mailbox", domainId: activeDomain, mailboxId: activeMailbox.id });
    } else {
      // Subscribe to domain
      subscribe({ type: "domain", domainId: activeDomain });
    }
  }, [enabled, activeDomain, activeMailbox, subscribe]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    subscribe,
    unsubscribe,
  };
}

// ============================================================
// HOOK FOR COMPONENT USE
// ============================================================

export function useMailRealtime() {
  const { isConnected } = useMailWebSocket();

  return {
    isConnected,
  };
}
