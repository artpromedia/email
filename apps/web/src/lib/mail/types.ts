/**
 * Multi-Domain Mail Types
 * Types for inbox, mailboxes, and domain-based mail management
 */

import type { Email, EmailFolder } from "@email/types";

// ============================================================
// DOMAIN TYPES
// ============================================================

/**
 * Domain with associated mailboxes
 */
export interface Domain {
  id: string;
  domain: string;
  displayName: string;
  color: string;
  logoUrl?: string;
  isPrimary: boolean;
  isVerified: boolean;
  unreadCount: number;
  totalCount: number;
  mailboxes: Mailbox[];
  sharedMailboxes: SharedMailbox[];
}

/**
 * Color options for domains
 */
export const DOMAIN_COLORS = [
  {
    name: "blue",
    value: "#3b82f6",
    bg: "bg-blue-500",
    text: "text-blue-500",
    light: "bg-blue-100",
  },
  {
    name: "purple",
    value: "#8b5cf6",
    bg: "bg-purple-500",
    text: "text-purple-500",
    light: "bg-purple-100",
  },
  {
    name: "green",
    value: "#22c55e",
    bg: "bg-green-500",
    text: "text-green-500",
    light: "bg-green-100",
  },
  {
    name: "orange",
    value: "#f97316",
    bg: "bg-orange-500",
    text: "text-orange-500",
    light: "bg-orange-100",
  },
  {
    name: "pink",
    value: "#ec4899",
    bg: "bg-pink-500",
    text: "text-pink-500",
    light: "bg-pink-100",
  },
  {
    name: "teal",
    value: "#14b8a6",
    bg: "bg-teal-500",
    text: "text-teal-500",
    light: "bg-teal-100",
  },
  {
    name: "indigo",
    value: "#6366f1",
    bg: "bg-indigo-500",
    text: "text-indigo-500",
    light: "bg-indigo-100",
  },
  {
    name: "rose",
    value: "#f43f5e",
    bg: "bg-rose-500",
    text: "text-rose-500",
    light: "bg-rose-100",
  },
] as const;

export type DomainColor = (typeof DOMAIN_COLORS)[number];

// ============================================================
// MAILBOX TYPES
// ============================================================

/**
 * Standard mailbox (user's own)
 */
export interface Mailbox {
  id: string;
  domainId: string;
  userId: string;
  email: string;
  displayName: string;
  type: "personal" | "alias";
  isDefault: boolean;
  signature?: string;
  unreadCount: number;
  folders: MailFolder[];
}

/**
 * Shared mailbox with multiple users
 */
export interface SharedMailbox extends Omit<Mailbox, "type" | "userId"> {
  type: "shared";
  members: SharedMailboxMember[];
  permissions: SharedMailboxPermissions;
}

export interface SharedMailboxMember {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export interface SharedMailboxPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManage: boolean;
}

// ============================================================
// FOLDER TYPES
// ============================================================

/**
 * Mail folder with nested structure
 */
export interface MailFolder {
  id: string;
  mailboxId: string;
  name: string;
  type: EmailFolder | "custom";
  icon?: string;
  color?: string;
  unreadCount: number;
  totalCount: number;
  parentId?: string;
  children?: MailFolder[];
  isSystem: boolean;
  sortOrder: number;
}

/**
 * System folder types with icons
 */
export const SYSTEM_FOLDERS: Record<EmailFolder, { icon: string; label: string }> = {
  inbox: { icon: "inbox", label: "Inbox" },
  sent: { icon: "send", label: "Sent" },
  drafts: { icon: "file-edit", label: "Drafts" },
  trash: { icon: "trash-2", label: "Trash" },
  spam: { icon: "alert-triangle", label: "Spam" },
  archive: { icon: "archive", label: "Archive" },
  starred: { icon: "star", label: "Starred" },
};

// ============================================================
// EMAIL LIST TYPES
// ============================================================

/**
 * Extended email for list display
 */
export interface EmailListItem extends Email {
  /** Domain this email belongs to */
  domainId: string;
  /** Domain name for display */
  domainName: string;
  /** Domain color for badge */
  domainColor: string;
  /** Whether to show domain badge (unified view) */
  showDomainBadge: boolean;
  /** Snippet of email body */
  snippet: string;
  /** Has been replied to */
  hasReplied: boolean;
  /** Has been forwarded */
  hasForwarded: boolean;
  /** Thread/conversation info */
  threadCount?: number;
}

/**
 * Email list query parameters with domain support
 */
export interface EmailListQuery {
  /** Filter by domain ('all' for unified view) */
  domain: string;
  /** Filter by mailbox ID */
  mailboxId?: string;
  /** Filter by folder */
  folder: EmailFolder | "custom";
  /** Custom folder ID if folder is 'custom' */
  folderId?: string;
  /** Search query */
  search?: string;
  /** Filter by starred */
  starred?: boolean;
  /** Filter by read status */
  read?: boolean;
  /** Filter by attachment presence */
  hasAttachments?: boolean;
  /** Date range start */
  fromDate?: Date;
  /** Date range end */
  toDate?: Date;
  /** Page number */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Sort field */
  sortBy: "date" | "from" | "subject" | "size";
  /** Sort direction */
  sortOrder: "asc" | "desc";
}

// ============================================================
// VIEW MODE TYPES
// ============================================================

/**
 * Inbox view mode
 */
export type ViewMode = "unified" | "domain" | "mailbox";

/**
 * View preferences
 */
export interface ViewPreferences {
  mode: ViewMode;
  activeDomain: string;
  activeMailbox?: string;
  showUnreadOnly: boolean;
  previewPane: "right" | "bottom" | "none";
  density: "comfortable" | "compact" | "cozy";
  groupByConversation: boolean;
}

// ============================================================
// MOVE/COPY TYPES
// ============================================================

/**
 * Move/copy destination
 */
export interface MoveDestination {
  domainId: string;
  mailboxId: string;
  folderId: string;
  folderName: string;
  domainName: string;
}

/**
 * Move/copy request
 */
export interface MoveEmailRequest {
  emailIds: string[];
  destination: MoveDestination;
  action: "move" | "copy";
  isCrossDomain: boolean;
}

// ============================================================
// REAL-TIME UPDATE TYPES
// ============================================================

/**
 * WebSocket subscription for mail updates
 */
export interface MailSubscription {
  type: "all" | "domain" | "mailbox";
  domainId?: string;
  mailboxId?: string;
}

/**
 * Real-time mail event
 */
export interface MailEvent {
  type: "new" | "read" | "unread" | "moved" | "deleted" | "starred" | "unstarred";
  emailId: string;
  domainId: string;
  mailboxId: string;
  folderId: string;
  timestamp: Date;
  data?: Partial<EmailListItem>;
}

/**
 * Unread count update
 */
export interface UnreadCountUpdate {
  domainId: string;
  mailboxId: string;
  folderId: string;
  count: number;
}
