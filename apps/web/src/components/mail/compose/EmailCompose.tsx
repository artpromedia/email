"use client";

/**
 * Email Compose Component
 * Main compose modal with editor, signatures, branding, and send validation
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  Paperclip,
  Trash2,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useSendableAddresses,
  useSignatureForAddress,
  useDomainBranding,
  useSendEmail,
  useSaveDraft,
  useUploadAttachment,
  useCheckSendPermission,
} from "@/lib/mail/compose-api";
import { useComposeStore, selectActiveDraft } from "@/lib/mail/compose-store";
import { ComposeHeader } from "./ComposeHeader";
import type {
  SendableAddress,
  EmailRecipient,
  ComposeAttachment,
  EmailSignature,
  EmailBranding,
  ComposeContext,
  SendEmailRequest,
} from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

interface EmailComposeProps {
  /** Optional initial context */
  context?: ComposeContext;
  /** Callback when compose is closed */
  onClose?: () => void;
  /** Class name */
  className?: string;
}

// ============================================================
// TOOLBAR COMPONENT
// ============================================================

function EditorToolbar({ onFormat }: { onFormat: (format: string) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => onFormat("bold")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat("italic")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat("underline")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Underline"
      >
        <Underline className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

      <button
        type="button"
        onClick={() => onFormat("unorderedList")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat("orderedList")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

      <button
        type="button"
        onClick={() => onFormat("link")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Insert Link"
      >
        <Link className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat("image")}
        className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="Insert Image"
      >
        <Image className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================
// ATTACHMENT ITEM COMPONENT
// ============================================================

interface AttachmentItemProps {
  attachment: ComposeAttachment;
  onRemove: () => void;
}

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        attachment.status === "error"
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
      )}
    >
      <Paperclip className="h-4 w-4 flex-shrink-0 text-neutral-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {attachment.name}
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {formatSize(attachment.size)}
          {attachment.status === "uploading" && attachment.progress !== undefined && (
            <span className="ml-2">• {attachment.progress}%</span>
          )}
          {attachment.status === "error" && attachment.error && (
            <span className="ml-2 text-red-600 dark:text-red-400">• {attachment.error}</span>
          )}
        </div>
      </div>
      {attachment.status === "uploading" && (
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
      )}
      {attachment.status === "complete" && (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="h-4 w-4 text-neutral-500" />
      </button>
    </div>
  );
}

// ============================================================
// SIGNATURE PREVIEW COMPONENT
// ============================================================

interface SignaturePreviewProps {
  signature: EmailSignature | null;
  onChangeSignature?: () => void;
}

function SignaturePreview({ signature, onChangeSignature }: SignaturePreviewProps) {
  if (!signature) return null;

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">Signature</span>
        {onChangeSignature && (
          <button
            type="button"
            onClick={onChangeSignature}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Change
          </button>
        )}
      </div>
      <div
        className="prose prose-sm dark:prose-invert max-w-none text-sm text-neutral-600 dark:text-neutral-400"
        dangerouslySetInnerHTML={{ __html: signature.contentHtml }}
      />
    </div>
  );
}

// ============================================================
// BRANDING PREVIEW COMPONENT
// ============================================================

interface BrandingPreviewProps {
  branding: EmailBranding | null;
  position: "header" | "footer";
}

function BrandingPreview({ branding, position }: BrandingPreviewProps) {
  if (!branding?.enabled) return null;

  const html = position === "header" ? branding.headerHtml : branding.footerHtml;
  if (!html) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-600 dark:bg-neutral-800/50",
        position === "header" ? "mb-4" : "mt-4"
      )}
    >
      <div className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {position === "header"
          ? "Email Header (from domain branding)"
          : "Email Footer (from domain branding)"}
      </div>
      <div
        className="prose prose-sm dark:prose-invert max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ============================================================
// SEND VALIDATION ERROR COMPONENT
// ============================================================

interface SendValidationErrorProps {
  error: string;
  onDismiss: () => void;
}

function SendValidationError({ error, onDismiss }: SendValidationErrorProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
      <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
      <span className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/30"
      >
        <X className="h-4 w-4 text-red-600 dark:text-red-400" />
      </button>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function EmailCompose({ context, onClose, className }: EmailComposeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Store state
  const {
    isComposeOpen,
    isFullScreen,
    isSending,
    sendError,
    validationErrors,
    showValidationErrors,
    currentSignature,
    currentBranding,
    sendableAddresses,
    openCompose,
    closeCompose,
    toggleFullScreen,
    setSending,
    setSendError,
    setFromAddress,
    setSendMode,
    addRecipient,
    removeRecipient,
    setSubject,
    setBody,
    addAttachment,
    updateAttachment,
    removeAttachment,
    validateDraft,
    setSignature,
    setBranding,
    setSendableAddresses,
  } = useComposeStore();

  const activeDraft = useComposeStore(selectActiveDraft);

  // API hooks
  const { data: addressData, isLoading: addressesLoading } = useSendableAddresses();
  const sendEmail = useSendEmail();
  const saveDraft = useSaveDraft();
  const uploadAttachment = useUploadAttachment();
  const checkPermission = useCheckSendPermission();

  // Load sendable addresses
  useEffect(() => {
    if (addressData) {
      setSendableAddresses(addressData.addresses, addressData.primaryAddressId);
    }
  }, [addressData, setSendableAddresses]);

  // Load signature when from address changes
  const signature = useSignatureForAddress(
    activeDraft?.fromAddressId ?? null,
    activeDraft?.fromAddress?.domainId ?? null
  );

  useEffect(() => {
    setSignature(signature ?? null);
  }, [signature, setSignature]);

  // Load branding when domain changes
  const { data: branding } = useDomainBranding(activeDraft?.fromAddress?.domainId ?? null);

  useEffect(() => {
    setBranding(branding ?? null);
  }, [branding, setBranding]);

  // Initialize compose if not open
  useEffect(() => {
    if (!isComposeOpen && context) {
      openCompose(context);
    }
  }, [context, isComposeOpen, openCompose]);

  // Convert validation errors to object
  const errors = useMemo(() => {
    if (!showValidationErrors) return {};
    const result: Record<string, string> = {};
    validationErrors.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [validationErrors, showValidationErrors]);

  // Handle from address change
  const handleFromChange = useCallback(
    (address: SendableAddress) => {
      if (activeDraft) {
        setFromAddress(activeDraft.id, address);
      }
    },
    [activeDraft, setFromAddress]
  );

  // Handle send mode change
  const handleSendModeChange = useCallback(
    (mode: "send-as" | "send-on-behalf") => {
      if (activeDraft) {
        setSendMode(activeDraft.id, mode);
      }
    },
    [activeDraft, setSendMode]
  );

  // Handle recipient changes
  const handleToChange = useCallback(
    (recipients: EmailRecipient[]) => {
      if (!activeDraft) return;
      // Clear existing and add new
      activeDraft.to.forEach((r) => removeRecipient(activeDraft.id, "to", r.email));
      recipients.forEach((r) => addRecipient(activeDraft.id, "to", r));
    },
    [activeDraft, addRecipient, removeRecipient]
  );

  const handleCcChange = useCallback(
    (recipients: EmailRecipient[]) => {
      if (!activeDraft) return;
      activeDraft.cc.forEach((r) => removeRecipient(activeDraft.id, "cc", r.email));
      recipients.forEach((r) => addRecipient(activeDraft.id, "cc", r));
    },
    [activeDraft, addRecipient, removeRecipient]
  );

  const handleBccChange = useCallback(
    (recipients: EmailRecipient[]) => {
      if (!activeDraft) return;
      activeDraft.bcc.forEach((r) => removeRecipient(activeDraft.id, "bcc", r.email));
      recipients.forEach((r) => addRecipient(activeDraft.id, "bcc", r));
    },
    [activeDraft, addRecipient, removeRecipient]
  );

  // Handle subject change
  const handleSubjectChange = useCallback(
    (subject: string) => {
      if (activeDraft) {
        setSubject(activeDraft.id, subject);
      }
    },
    [activeDraft, setSubject]
  );

  // Handle body change
  const handleBodyChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeDraft) {
        setBody(activeDraft.id, e.target.value);
      }
    },
    [activeDraft, setBody]
  );

  // Handle format commands
  const handleFormat = useCallback((format: string) => {
    // In a real implementation, this would apply formatting to the editor
    console.info(`Format: ${format}`);
  }, []);

  // Handle file attachment
  const handleAttachFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activeDraft || !e.target.files) return;

      const files = Array.from(e.target.files);

      for (const file of files) {
        const attachmentId = crypto.randomUUID();

        // Add attachment in pending state
        addAttachment(activeDraft.id, {
          id: attachmentId,
          name: file.name,
          size: file.size,
          type: file.type,
          status: "uploading",
          progress: 0,
        });

        try {
          const result = await uploadAttachment.mutateAsync(file);
          updateAttachment(activeDraft.id, attachmentId, {
            status: "complete",
            fileId: result.fileId,
            progress: 100,
          });
        } catch (error) {
          updateAttachment(activeDraft.id, attachmentId, {
            status: "error",
            error: error instanceof Error ? error.message : "Upload failed",
          });
        }
      }

      // Reset input
      e.target.value = "";
    },
    [activeDraft, addAttachment, updateAttachment, uploadAttachment]
  );

  // Handle attachment removal
  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      if (activeDraft) {
        removeAttachment(activeDraft.id, attachmentId);
      }
    },
    [activeDraft, removeAttachment]
  );

  // Handle send
  const handleSend = useCallback(async () => {
    if (!activeDraft) return;

    // Validate draft
    const isValid = validateDraft(activeDraft.id);
    if (!isValid) return;

    setSending(true);
    setSendError(null);

    try {
      // Check send permission
      const permission = await checkPermission.mutateAsync(activeDraft.fromAddressId);
      if (!permission.allowed) {
        setSendError(permission.error ?? "You don't have permission to send from this address");
        setSending(false);
        return;
      }

      // Build send request
      const request: SendEmailRequest = {
        fromAddressId: activeDraft.fromAddressId,
        sendMode: activeDraft.sendMode,
        to: activeDraft.to.map((r) => r.email),
        cc: activeDraft.cc.length > 0 ? activeDraft.cc.map((r) => r.email) : undefined,
        bcc: activeDraft.bcc.length > 0 ? activeDraft.bcc.map((r) => r.email) : undefined,
        subject: activeDraft.subject,
        body: activeDraft.body,
        bodyHtml: activeDraft.bodyHtml || undefined,
        attachmentIds: activeDraft.attachments
          .filter(
            (a): a is ComposeAttachment & { fileId: string } =>
              a.status === "complete" && !!a.fileId
          )
          .map((a) => a.fileId),
        priority: activeDraft.priority !== "normal" ? activeDraft.priority : undefined,
        requestReadReceipt: activeDraft.requestReadReceipt || undefined,
        inReplyTo:
          activeDraft.replyType && activeDraft.originalEmailId
            ? activeDraft.originalEmailId
            : undefined,
      };

      await sendEmail.mutateAsync(request);

      // Close compose on success
      closeCompose();
      onClose?.();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }, [
    activeDraft,
    validateDraft,
    checkPermission,
    sendEmail,
    closeCompose,
    onClose,
    setSending,
    setSendError,
  ]);

  // Handle save draft
  const handleSaveDraft = useCallback(async () => {
    if (!activeDraft) return;

    try {
      await saveDraft.mutateAsync({
        id: activeDraft.id,
        fromAddressId: activeDraft.fromAddressId,
        to: activeDraft.to.map((r) => r.email),
        cc: activeDraft.cc.map((r) => r.email),
        bcc: activeDraft.bcc.map((r) => r.email),
        subject: activeDraft.subject,
        body: activeDraft.body,
        bodyHtml: activeDraft.bodyHtml,
        attachmentIds: activeDraft.attachments
          .filter((a): a is ComposeAttachment & { fileId: string } => !!a.fileId)
          .map((a) => a.fileId),
        inReplyTo: activeDraft.originalEmailId,
      });
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  }, [activeDraft, saveDraft]);

  // Handle close
  const handleClose = useCallback(() => {
    // Auto-save draft if there's content
    if (activeDraft && (activeDraft.to.length > 0 || activeDraft.subject || activeDraft.body)) {
      void handleSaveDraft();
    }
    closeCompose();
    onClose?.();
  }, [activeDraft, handleSaveDraft, closeCompose, onClose]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    closeCompose();
    onClose?.();
  }, [closeCompose, onClose]);

  if (!isComposeOpen || !activeDraft) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed z-50 rounded-t-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900",
        "flex flex-col overflow-hidden",
        isFullScreen ? "inset-4" : "bottom-0 right-4 max-h-[80vh] w-[600px]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
          {activeDraft.replyType === "reply"
            ? "Reply"
            : activeDraft.replyType === "reply-all"
              ? "Reply All"
              : activeDraft.replyType === "forward"
                ? "Forward"
                : "New Message"}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="rounded p-1.5 text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
            title={isFullScreen ? "Minimize" : "Maximize"}
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1.5 text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Send error */}
      {sendError && (
        <div className="px-4 pt-4">
          <SendValidationError error={sendError} onDismiss={() => setSendError(null)} />
        </div>
      )}

      {/* Header fields */}
      <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
        <ComposeHeader
          fromAddress={activeDraft.fromAddress ?? null}
          fromAddresses={sendableAddresses}
          sendMode={activeDraft.sendMode}
          toRecipients={activeDraft.to}
          ccRecipients={activeDraft.cc}
          bccRecipients={activeDraft.bcc}
          subject={activeDraft.subject}
          errors={errors}
          onFromChange={handleFromChange}
          onSendModeChange={handleSendModeChange}
          onToChange={handleToChange}
          onCcChange={handleCcChange}
          onBccChange={handleBccChange}
          onSubjectChange={handleSubjectChange}
          disabled={isSending}
        />
      </div>

      {/* Editor */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <EditorToolbar onFormat={handleFormat} />

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {/* Branding header */}
          <BrandingPreview branding={currentBranding} position="header" />

          {/* Text editor */}
          <textarea
            ref={editorRef}
            value={activeDraft.body}
            onChange={handleBodyChange}
            placeholder="Write your message..."
            disabled={isSending}
            className={cn(
              "min-h-[200px] w-full resize-none bg-transparent outline-none",
              "text-neutral-900 dark:text-neutral-100",
              "placeholder-neutral-400 dark:placeholder-neutral-500",
              "disabled:opacity-60"
            )}
          />

          {/* Signature */}
          <SignaturePreview signature={currentSignature} />

          {/* Branding footer */}
          <BrandingPreview branding={currentBranding} position="footer" />
        </div>

        {/* Attachments */}
        {activeDraft.attachments.length > 0 && (
          <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Attachments ({activeDraft.attachments.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {activeDraft.attachments.map((attachment) => (
                <AttachmentItem
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => handleRemoveAttachment(attachment.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex items-center gap-2">
          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || addressesLoading}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium",
              "bg-blue-600 text-white hover:bg-blue-700",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "transition-colors duration-100"
            )}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </button>

          {/* Send options dropdown */}
          <button
            type="button"
            className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            title="Send options"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Attach */}
          <button
            type="button"
            onClick={handleAttachFiles}
            disabled={isSending}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* More options */}
          <button
            type="button"
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            title="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {/* Discard */}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSending}
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800"
            title="Discard"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
