import { useNavigate } from "react-router-dom";
import {
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Paperclip,
  Clock,
  Zap,
  Edit,
  Send,
  Calendar,
  RefreshCw,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMail } from "@/contexts/MailContext";
import { cn } from "@/lib/utils";

export function MailList() {
  const {
    threads,
    selectedThread,
    selectedThreads,
    currentView,
    currentCategory,
    currentLabel,
    labels,
    selectThread,
    toggleThreadSelection,
    archiveThreads,
    deleteThreads,
    starThreads,
    markAsRead,
    // Folder-specific actions
    discardDraft,
    convertToScheduled,
    resendMessage,
    createTemplate,
    editScheduled,
    sendNow,
    cancelScheduled,
    retryOutbox,
    cancelOutbox,
  } = useMail();
  const navigate = useNavigate();

  const handleThreadClick = (threadId: string) => {
    selectThread(threadId);

    // Update URL based on current context
    if (currentCategory) {
      navigate(`/mail/category/${currentCategory}/${threadId}`);
    } else if (currentLabel) {
      navigate(`/mail/label/${currentLabel}/${threadId}`);
    } else if (currentView === "quarantine") {
      navigate(`/mail/quarantine/${threadId}`);
    } else {
      navigate(`/mail/${currentView}/${threadId}`);
    }
  };

  const handleArchive = () => {
    if (selectedThreads.length > 0) {
      archiveThreads(selectedThreads);
    }
  };

  const handleDelete = () => {
    if (selectedThreads.length > 0) {
      deleteThreads(selectedThreads);
    }
  };

  const handleStar = (threadId: string, starred: boolean) => {
    starThreads([threadId], starred);
  };

  // Folder-specific action handlers
  const handleDraftAction = (
    messageId: string,
    action: "edit" | "discard" | "schedule",
  ) => {
    switch (action) {
      case "edit":
        // Navigate to compose view with draft
        navigate(`/compose/${messageId}`);
        break;
      case "discard":
        discardDraft(messageId);
        break;
      case "schedule":
        // Show scheduling dialog
        const scheduledTime = new Date(Date.now() + 86400000); // Default to tomorrow
        convertToScheduled(messageId, scheduledTime);
        break;
    }
  };

  const handleSentAction = (
    messageId: string,
    action: "resend" | "template",
  ) => {
    switch (action) {
      case "resend":
        resendMessage(messageId);
        break;
      case "template":
        createTemplate(messageId);
        break;
    }
  };

  const handleScheduledAction = (
    messageId: string,
    action: "edit" | "send" | "cancel",
  ) => {
    switch (action) {
      case "edit":
        // Show scheduling dialog
        const newTime = new Date(Date.now() + 172800000); // Default to day after tomorrow
        editScheduled(messageId, newTime);
        break;
      case "send":
        sendNow(messageId);
        break;
      case "cancel":
        cancelScheduled(messageId);
        break;
    }
  };

  const handleOutboxAction = (
    messageId: string,
    action: "retry" | "cancel",
  ) => {
    switch (action) {
      case "retry":
        retryOutbox(messageId);
        break;
      case "cancel":
        cancelOutbox(messageId);
        break;
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (
      messageDate.getTime() ===
      today.getTime() - 24 * 60 * 60 * 1000
    ) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getTitle = () => {
    if (currentCategory) {
      const category = useMail().categories.find(
        (c) => c.id === currentCategory,
      );
      return category?.name || "Category";
    }
    if (currentLabel) {
      const label = useMail().labels.find((l) => l.id === currentLabel);
      return label?.name || "Label";
    }
    if (currentView === "quarantine") {
      return "Quarantine";
    }
    return currentView.charAt(0).toUpperCase() + currentView.slice(1);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{getTitle()}</h2>
          <div className="text-sm text-muted-foreground">
            {threads.length} conversations
          </div>
        </div>

        {/* Toolbar */}
        {selectedThreads.length > 0 && (
          <div className="flex items-center gap-2 mt-3 p-2 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">
              {selectedThreads.length} selected
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="ghost" size="sm" onClick={handleArchive}>
                <Archive className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => markAsRead(selectedThreads, true)}
                  >
                    Mark as read
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => markAsRead(selectedThreads, false)}
                  >
                    Mark as unread
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => starThreads(selectedThreads, true)}
                  >
                    Add star
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => starThreads(selectedThreads, false)}
                  >
                    Remove star
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                <Archive className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium mb-2">No messages</h3>
              <p className="text-sm">This folder is empty</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => handleThreadClick(thread.id)}
                className={cn(
                  "flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                  selectedThread?.id === thread.id && "bg-muted",
                  thread.unreadCount > 0 && "font-medium",
                )}
              >
                {/* Selection Checkbox */}
                <Checkbox
                  checked={selectedThreads.includes(thread.id)}
                  onCheckedChange={() => toggleThreadSelection(thread.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />

                {/* Star */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStar(thread.id, !thread.isStarred);
                  }}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      thread.isStarred
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground",
                    )}
                  />
                </Button>

                {/* Important */}
                {thread.isImportant && (
                  <Zap className="h-4 w-4 text-yellow-500" />
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          thread.unreadCount > 0
                            ? "font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {thread.participants.join(", ")}
                      </span>
                      {thread.messages.some((m) => m.attachments?.length) && (
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {thread.messages.some((m) => m.isSnoozed) && (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )}
                      {/* Folder-specific indicators */}
                      {currentView === "drafts" &&
                        thread.messages[0]?.lastEditedAt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-xs"
                          >
                            Draft
                          </Badge>
                        )}
                      {currentView === "scheduled" &&
                        thread.messages[0]?.scheduledAt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-xs bg-blue-50 text-blue-700"
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(
                              thread.messages[0].scheduledAt,
                            ).toLocaleDateString()}
                          </Badge>
                        )}
                      {currentView === "sent" &&
                        thread.messages[0]?.deliveryStatus && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 px-1.5 text-xs",
                              thread.messages[0].deliveryStatus === "sent" &&
                                "bg-green-50 text-green-700",
                              thread.messages[0].deliveryStatus === "bounced" &&
                                "bg-red-50 text-red-700",
                            )}
                          >
                            {thread.messages[0].deliveryStatus}
                          </Badge>
                        )}
                      {currentView === "outbox" &&
                        thread.messages[0]?.deliveryStatus === "failed" && (
                          <Badge
                            variant="destructive"
                            className="h-5 px-1.5 text-xs"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      <span className="text-xs text-muted-foreground">
                        {currentView === "drafts" &&
                        thread.messages[0]?.lastEditedAt
                          ? formatDate(thread.messages[0].lastEditedAt)
                          : formatDate(thread.lastMessageDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm truncate",
                          thread.unreadCount > 0
                            ? "font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {thread.subject}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {thread.messages[thread.messages.length - 1]?.body}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 ml-2">
                      {/* Folder-specific action buttons */}
                      {currentView === "drafts" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDraftAction(thread.messages[0]?.id, "edit");
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleDraftAction(
                                    thread.messages[0]?.id,
                                    "schedule",
                                  )
                                }
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                Schedule send
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleDraftAction(
                                    thread.messages[0]?.id,
                                    "discard",
                                  )
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Discard
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}

                      {currentView === "sent" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() =>
                                handleSentAction(
                                  thread.messages[0]?.id,
                                  "resend",
                                )
                              }
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Resend
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleSentAction(
                                  thread.messages[0]?.id,
                                  "template",
                                )
                              }
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Create template
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {currentView === "scheduled" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScheduledAction(
                                thread.messages[0]?.id,
                                "send",
                              );
                            }}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScheduledAction(
                                    thread.messages[0]?.id,
                                    "edit",
                                  )
                                }
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                Edit schedule
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScheduledAction(
                                    thread.messages[0]?.id,
                                    "cancel",
                                  )
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}

                      {currentView === "outbox" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOutboxAction(
                                thread.messages[0]?.id,
                                "retry",
                              );
                            }}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOutboxAction(
                                thread.messages[0]?.id,
                                "cancel",
                              );
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {thread.labels.map((labelId) => {
                        const label = labels.find((l) => l.id === labelId);
                        return label ? (
                          <Badge
                            key={labelId}
                            variant="outline"
                            className="h-5 px-1.5 text-xs"
                            style={{
                              borderColor: label.color,
                              color: label.color,
                            }}
                          >
                            {label.name}
                          </Badge>
                        ) : null;
                      })}
                      {thread.unreadCount > 0 && (
                        <Badge variant="default" className="h-5 px-1.5 text-xs">
                          {thread.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
