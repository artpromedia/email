import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Paperclip,
  Download,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMail } from "@/contexts/MailContext";
import { cn } from "@/lib/utils";

export function MailThread() {
  const [expandedMessages, setExpandedMessages] = useState<string[]>([]);
  const { selectedThread, starThreads, archiveThreads, deleteThreads } =
    useMail();
  const navigate = useNavigate();

  if (!selectedThread) {
    return null;
  }

  const handleBack = () => {
    navigate(-1);
  };

  const handleStar = () => {
    starThreads([selectedThread.id], !selectedThread.isStarred);
  };

  const handleArchive = () => {
    archiveThreads([selectedThread.id]);
    navigate(-1);
  };

  const handleDelete = () => {
    deleteThreads([selectedThread.id]);
    navigate(-1);
  };

  const toggleMessage = (messageId: string) => {
    setExpandedMessages((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId],
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getInitials = (email: string) => {
    return email.split("@")[0].charAt(0).toUpperCase();
  };

  const sortedMessages = [...selectedThread.messages].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Expand the last message by default
  if (expandedMessages.length === 0 && sortedMessages.length > 0) {
    setExpandedMessages([sortedMessages[sortedMessages.length - 1].id]);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {selectedThread.subject}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedThread.messages.length} message
              {selectedThread.messages.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleStar}>
            <Star
              className={cn(
                "h-4 w-4",
                selectedThread.isStarred
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground",
              )}
            />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleArchive}>
            <Archive className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Mark as unread</DropdownMenuItem>
              <DropdownMenuItem>Add label</DropdownMenuItem>
              <DropdownMenuItem>Snooze</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Block sender</DropdownMenuItem>
              <DropdownMenuItem>Report spam</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sortedMessages.map((message, index) => {
          const isExpanded = expandedMessages.includes(message.id);
          const isLast = index === sortedMessages.length - 1;

          return (
            <div
              key={message.id}
              className={cn(
                "border rounded-lg",
                isExpanded ? "bg-background" : "bg-muted/30",
              )}
            >
              {/* Message Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => toggleMessage(message.id)}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{getInitials(message.from)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {message.from.split("@")[0]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        &lt;{message.from}&gt;
                      </span>
                      {message.isImportant && (
                        <Badge variant="outline" className="h-5 px-1.5 text-xs">
                          Important
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>to {message.to.join(", ")}</span>
                      {message.cc && message.cc.length > 0 && (
                        <span>cc {message.cc.join(", ")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  )}
                  {message.isSnoozed && (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(message.date)}
                  </span>
                </div>
              </div>

              {/* Message Content */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="prose prose-sm max-w-none">
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: message.body }}
                    />
                  </div>

                  {/* Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="text-sm font-medium mb-2">
                        {message.attachments.length} attachment
                        {message.attachments.length !== 1 ? "s" : ""}
                      </h4>
                      <div className="space-y-2">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-2 bg-muted rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">
                                  {attachment.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {isLast && (
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                      <Button variant="outline" size="sm">
                        <Reply className="mr-2 h-4 w-4" />
                        Reply
                      </Button>
                      <Button variant="outline" size="sm">
                        <ReplyAll className="mr-2 h-4 w-4" />
                        Reply all
                      </Button>
                      <Button variant="outline" size="sm">
                        <Forward className="mr-2 h-4 w-4" />
                        Forward
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
