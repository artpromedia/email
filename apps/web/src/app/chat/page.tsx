"use client";

import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatProvider } from "@/lib/chat/chat-context";

export default function ChatPage() {
  // In production, get token from auth context
  const token = "your-auth-token";

  return (
    <ChatProvider token={token}>
      <ChatLayout />
    </ChatProvider>
  );
}
