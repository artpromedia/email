"use client";

/**
 * Chat Page
 * Internal messaging / team chat interface
 */

import { MessageCircle, Search, Plus } from "lucide-react";
import { Button } from "@email/ui";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <MessageCircle className="mx-auto h-16 w-16 text-neutral-300 dark:text-neutral-600" />
          <h2 className="mt-4 text-lg font-medium text-neutral-700 dark:text-neutral-300">
            Team Chat
          </h2>
          <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Chat with your team members in real-time. Start a new conversation or continue an
            existing one.
          </p>
          <Button className="mt-6" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Start a Conversation
          </Button>
        </div>
      </div>
    </div>
  );
}
