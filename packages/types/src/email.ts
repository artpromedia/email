import { z } from "zod";

/**
 * Email status enumeration
 */
export const EmailStatus = {
  DRAFT: "draft",
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
  FAILED: "failed",
} as const;

export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

/**
 * Email priority enumeration
 */
export const EmailPriority = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type EmailPriority = (typeof EmailPriority)[keyof typeof EmailPriority];

/**
 * Email folder enumeration
 */
export const EmailFolder = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFTS: "drafts",
  TRASH: "trash",
  SPAM: "spam",
  ARCHIVE: "archive",
  STARRED: "starred",
} as const;

export type EmailFolder = (typeof EmailFolder)[keyof typeof EmailFolder];

/**
 * Email address with optional display name
 */
export interface EmailAddress {
  address: string;
  name?: string;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  checksum?: string;
  isInline?: boolean;
  contentId?: string;
}

/**
 * Email header
 */
export interface EmailHeader {
  name: string;
  value: string;
}

/**
 * Email tracking events
 */
export interface EmailTrackingEvent {
  id: string;
  emailId: string;
  type: "open" | "click" | "bounce" | "complaint" | "delivery";
  timestamp: Date;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  linkUrl?: string;
}

/**
 * Complete email message
 */
export interface Email {
  id: string;
  organizationId: string;
  domain: string;
  messageId: string;
  conversationId?: string;
  inReplyTo?: string;
  references?: string[];
  from: EmailAddress;
  replyTo?: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
  headers?: EmailHeader[];
  folder: EmailFolder;
  status: EmailStatus;
  priority: EmailPriority;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  labels?: string[];
  scheduledAt?: Date;
  sentAt?: Date;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Email send request
 */
export interface SendEmailRequest {
  from?: EmailAddress;
  replyTo?: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: {
    filename: string;
    content: string | Buffer;
    mimeType?: string;
    contentId?: string;
  }[];
  headers?: EmailHeader[];
  priority?: EmailPriority;
  scheduledAt?: Date;
  trackOpens?: boolean;
  trackClicks?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Email send response
 */
export interface SendEmailResponse {
  id: string;
  messageId: string;
  status: EmailStatus;
  scheduledAt?: Date;
  sentAt?: Date;
}

/**
 * Zod schemas for validation
 */
export const emailAddressSchema = z.object({
  address: z.string().email(),
  name: z.string().optional(),
});

export const sendEmailRequestSchema = z.object({
  from: emailAddressSchema.optional(),
  replyTo: emailAddressSchema.optional(),
  to: z.array(emailAddressSchema).min(1).max(500),
  cc: z.array(emailAddressSchema).max(500).optional(),
  bcc: z.array(emailAddressSchema).max(500).optional(),
  subject: z.string().min(1).max(998),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        content: z.union([z.string(), z.instanceof(Buffer)]),
        mimeType: z.string().optional(),
        contentId: z.string().optional(),
      })
    )
    .optional(),
  headers: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    )
    .optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  scheduledAt: z.date().optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Email list query parameters
 */
export interface EmailListParams {
  folder?: EmailFolder;
  status?: EmailStatus;
  isRead?: boolean;
  isStarred?: boolean;
  labels?: string[];
  search?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: "date" | "from" | "subject" | "size";
  sortOrder?: "asc" | "desc";
}

/**
 * Email template
 */
export interface EmailTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  variables: string[];
  category?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
