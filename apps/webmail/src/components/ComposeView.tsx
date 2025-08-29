import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Send,
  Paperclip,
  MoreHorizontal,
  Calendar,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMail } from "@/contexts/MailContext";
import { cn } from "@/lib/utils";

export function ComposeView() {
  const { messageId } = useParams();
  const navigate = useNavigate();
  const { threads, autoSaveDraft, discardDraft } = useMail();
  const autoSaveInterval = useRef<NodeJS.Timeout | null>(null);

  // Find the draft message
  const draftThread = threads.find((thread) =>
    thread.messages.some((msg) => msg.id === messageId),
  );
  const draftMessage = draftThread?.messages.find(
    (msg) => msg.id === messageId,
  );

  const [formData, setFormData] = useState({
    to: draftMessage?.to.join(", ") || "",
    cc: draftMessage?.cc?.join(", ") || "",
    bcc: draftMessage?.bcc?.join(", ") || "",
    subject: draftMessage?.subject || "",
    body: draftMessage?.body || "",
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Auto-save every 5 seconds
  useEffect(() => {
    if (hasChanges && messageId) {
      autoSaveInterval.current = setTimeout(() => {
        autoSaveDraft(messageId, {
          to: formData.to.split(",").map((email) => email.trim()),
          cc: formData.cc
            ? formData.cc.split(",").map((email) => email.trim())
            : undefined,
          bcc: formData.bcc
            ? formData.bcc.split(",").map((email) => email.trim())
            : undefined,
          subject: formData.subject,
          body: formData.body,
        });
        setHasChanges(false);
      }, 5000);
    }

    return () => {
      if (autoSaveInterval.current) {
        clearTimeout(autoSaveInterval.current);
      }
    };
  }, [hasChanges, formData, messageId, autoSaveDraft]);

  // Save on blur
  const handleBlur = () => {
    if (hasChanges && messageId) {
      autoSaveDraft(messageId, {
        to: formData.to.split(",").map((email) => email.trim()),
        cc: formData.cc
          ? formData.cc.split(",").map((email) => email.trim())
          : undefined,
        bcc: formData.bcc
          ? formData.bcc.split(",").map((email) => email.trim())
          : undefined,
        subject: formData.subject,
        body: formData.body,
      });
      setHasChanges(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (messageId) {
      autoSaveDraft(messageId, {
        to: formData.to.split(",").map((email) => email.trim()),
        cc: formData.cc
          ? formData.cc.split(",").map((email) => email.trim())
          : undefined,
        bcc: formData.bcc
          ? formData.bcc.split(",").map((email) => email.trim())
          : undefined,
        subject: formData.subject,
        body: formData.body,
      });
      setHasChanges(false);
    }
  };

  const handleSend = () => {
    // TODO: Implement send functionality
    console.log("Sending message:", formData);
    navigate("/mail/sent");
  };

  const handleDiscard = () => {
    if (messageId) {
      discardDraft(messageId);
      navigate("/mail/drafts");
    }
  };

  const handleBack = () => {
    navigate("/mail/drafts");
  };

  if (!draftMessage) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Draft not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            {formData.subject || "New Message"}
          </h1>
          {hasChanges && (
            <span className="text-xs text-muted-foreground">
              • Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button onClick={handleSend}>
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule send
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Paperclip className="mr-2 h-4 w-4" />
                Attach files
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDiscard}>
                <Trash2 className="mr-2 h-4 w-4" />
                Discard draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Compose Form */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Recipients */}
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              value={formData.to}
              onChange={(e) => handleChange("to", e.target.value)}
              onBlur={handleBlur}
              placeholder="Recipients"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cc">CC</Label>
              <Input
                id="cc"
                value={formData.cc}
                onChange={(e) => handleChange("cc", e.target.value)}
                onBlur={handleBlur}
                placeholder="CC recipients"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bcc">BCC</Label>
              <Input
                id="bcc"
                value={formData.bcc}
                onChange={(e) => handleChange("bcc", e.target.value)}
                onBlur={handleBlur}
                placeholder="BCC recipients"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => handleChange("subject", e.target.value)}
              onBlur={handleBlur}
              placeholder="Subject"
              className="w-full"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              value={formData.body}
              onChange={(e) => handleChange("body", e.target.value)}
              onBlur={handleBlur}
              placeholder="Write your message..."
              className={cn(
                "flex min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>

          {/* Attachments */}
          {draftMessage.attachments && draftMessage.attachments.length > 0 && (
            <div className="space-y-2">
              <Label>Attachments</Label>
              <div className="space-y-2">
                {draftMessage.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-2 border rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{attachment.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(attachment.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
