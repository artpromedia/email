// Common types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  date: Date;
  flags: EmailFlag[];
  labels: string[];
  folderId: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  disposition: 'attachment' | 'inline';
}

export interface EmailFolder {
  id: string;
  name: string;
  path: string;
  parentId?: string;
  type: FolderType;
  messageCount: number;
  unreadCount: number;
}

export enum FolderType {
  INBOX = 'inbox',
  SENT = 'sent',
  DRAFTS = 'drafts',
  TRASH = 'trash',
  SPAM = 'spam',
  CUSTOM = 'custom',
}

export enum EmailFlag {
  SEEN = 'seen',
  ANSWERED = 'answered',
  FLAGGED = 'flagged',
  DELETED = 'deleted',
  DRAFT = 'draft',
  RECENT = 'recent',
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Mail API types
export interface SendMailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: {
    filename: string;
    contentType: string;
    content: string; // base64 encoded
    size: number;
  }[];
  priority?: 'low' | 'normal' | 'high';
  scheduleAt?: Date;
}

export interface SendMailResponse {
  messageId: string;
  queueId: string;
  status: 'queued' | 'scheduled';
}

export interface MailSearchRequest {
  query?: string;
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  flags?: EmailFlag[];
  limit?: number;
  offset?: number;
}

export interface MailSearchResponse {
  messages: EmailMessage[];
  total: number;
  hasMore: boolean;
}

// Aliases for backward compatibility
export type MailMessage = EmailMessage;
export type MailFolder = EmailFolder;
