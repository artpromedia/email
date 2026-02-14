"use client";

import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatProvider } from "@/lib/chat/chat-context";

function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export default function ChatPage() {
  const token = useSyncExternalStore(subscribeToStorage, getAccessToken, () => null);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading chat...</span>
        </div>
      </div>
    );
  }

  return (
    <ChatProvider token={token}>
      <ChatLayout />
    </ChatProvider>
  );
}
