/**
 * Transform DB models to API response format
 * Maps between the database schema and the client-side TypeScript types
 */
import {
  specialUseToFolderType,
  type DbMessage,
  type DbFolder,
  type DbMailbox,
  type DbDomain,
} from "./queries";

interface EmailAddress {
  address: string;
  name?: string;
}

/**
 * Transform a DB message + context into an EmailListItem-compatible response
 */
export function toEmailResponse(
  msg: DbMessage,
  context: {
    folder?: DbFolder | null;
    mailbox?: DbMailbox | null;
    domain?: DbDomain | null;
    showDomainBadge?: boolean;
  } = {}
) {
  const flags = Array.isArray(msg.flags) ? msg.flags : [];
  const isRead = flags.includes("\\Seen");
  const isStarred = flags.includes("\\Flagged");
  const isArchived = context.folder?.specialUse === "\\Archive";
  const hasReplied = flags.includes("\\Answered");
  const isDraft = flags.includes("\\Draft");

  const sender: EmailAddress =
    typeof msg.sender === "object" && msg.sender !== null
      ? (msg.sender as EmailAddress)
      : { address: String(msg.sender ?? "") };

  const toArray = ensureAddressArray(msg.recipientsTo);
  const ccArray = ensureAddressArray(msg.recipientsCc);
  const bccArray = ensureAddressArray(msg.recipientsBcc);

  const folderType = context.folder ? specialUseToFolderType(context.folder.specialUse) : "inbox";

  return {
    id: msg.id,
    organizationId: "",
    domain: context.domain?.name ?? "",
    messageId: msg.messageId ?? "",
    conversationId: undefined,
    inReplyTo: msg.inReplyTo ?? undefined,
    references: msg.referencesHeader ? msg.referencesHeader.split(/\s+/) : undefined,
    from: sender,
    replyTo: msg.replyTo ? { address: msg.replyTo } : undefined,
    to: toArray,
    cc: ccArray.length > 0 ? ccArray : undefined,
    bcc: bccArray.length > 0 ? bccArray : undefined,
    subject: msg.subject,
    textBody: msg.textBody ?? undefined,
    htmlBody: msg.htmlBody ?? undefined,
    attachments: [],
    headers: msg.rawHeaders
      ? Object.entries(msg.rawHeaders).map(([name, value]) => ({
          name,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }))
      : undefined,
    folder: folderType,
    status: isDraft ? "draft" : isRead ? "delivered" : "sent",
    priority: "normal" as const,
    isRead,
    isStarred,
    isArchived,
    labels: [],
    sentAt: msg.date ? new Date(msg.date).toISOString() : undefined,
    receivedAt: msg.date ? new Date(msg.date).toISOString() : undefined,
    createdAt: new Date(msg.createdAt).toISOString(),
    updatedAt: new Date(msg.createdAt).toISOString(),
    // EmailListItem extensions
    domainId: context.domain?.id ?? context.mailbox?.domainId ?? "",
    domainName: context.domain?.name ?? "",
    domainColor: "#3b82f6",
    showDomainBadge: context.showDomainBadge ?? false,
    snippet: msg.snippet || (msg.textBody ?? "").slice(0, 200),
    hasReplied,
    hasForwarded: false,
    threadCount: undefined,
  };
}

/**
 * Transform a DB folder into a MailFolder-compatible response
 */
export function toFolderResponse(
  folder: DbFolder,
  context: {
    mailbox?: DbMailbox | null;
    domain?: DbDomain | null;
  } = {}
) {
  const folderType = specialUseToFolderType(folder.specialUse);
  return {
    id: folder.id,
    mailboxId: folder.mailboxId,
    name: folder.name,
    type: folderType,
    icon: FOLDER_ICONS[folderType] ?? "folder",
    color: undefined,
    unreadCount: folder.unseenCount,
    totalCount: folder.messageCount,
    parentId: folder.parentId ?? undefined,
    children: [],
    isSystem: folder.specialUse !== null,
    sortOrder: folder.sortOrder,
    // Extended info
    domainId: context.domain?.id ?? context.mailbox?.domainId ?? "",
    domainName: context.domain?.name ?? "",
    mailboxEmail: context.mailbox?.email ?? "",
  };
}

const FOLDER_ICONS: Record<string, string> = {
  inbox: "inbox",
  sent: "send",
  drafts: "file-edit",
  trash: "trash-2",
  spam: "alert-triangle",
  archive: "archive",
  starred: "star",
  custom: "folder",
};

function ensureAddressArray(value: unknown): EmailAddress[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (typeof v === "string") return { address: v };
      if (typeof v === "object" && v !== null) {
        const obj = v as Record<string, unknown>;
        const addr = obj["address"] ?? obj["email"] ?? "";
        return {
          address: typeof addr === "string" ? addr : JSON.stringify(addr),
          name: typeof obj["name"] === "string" ? obj["name"] : undefined,
        };
      }
      return { address: String(v) };
    });
  }
  if (typeof value === "string") return [{ address: value }];
  return [];
}
