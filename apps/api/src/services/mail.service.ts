import {
  EmailMessage,
  EmailFolder,
  EmailFlag,
  EmailAttachment,
  SendMailRequest,
  MailSearchRequest,
  MailSearchResponse,
} from "@ceerion/shared";
import { Telemetry } from "@ceerion/observability";
import { DatabaseAdapter } from "../db/adapter";

export class MailService {
  constructor(
    private db: DatabaseAdapter,
    private telemetry: Telemetry,
  ) {}

  async getUserMessages(
    userId: string,
    folderId?: string,
    limit = 50,
    offset = 0,
  ): Promise<EmailMessage[]> {
    return this.telemetry.withSpan("mail.getUserMessages", async (span) => {
      const query = `
        SELECT m.*, f.name as folder_name
        FROM messages m
        JOIN folders f ON m.folder_id = f.id
        WHERE m.user_id = $1
        ${folderId ? "AND m.folder_id = $2" : ""}
        ORDER BY m.date DESC
        LIMIT $${folderId ? "3" : "2"} OFFSET $${folderId ? "4" : "3"}
      `;

      const params = folderId
        ? [userId, folderId, limit, offset]
        : [userId, limit, offset];
      const result = await this.db.query(query, params);

      return result.rows.map(this.mapRowToMessage);
    });
  }

  async getMessage(
    userId: string,
    messageId: string,
  ): Promise<EmailMessage | null> {
    return this.telemetry.withSpan("mail.getMessage", async (span) => {
      const query = `
        SELECT m.*, f.name as folder_name
        FROM messages m
        LEFT JOIN folders f ON m."folderId" = f.id
        WHERE m.id = $1 AND m."userId" = $2
      `;

      const result = await this.db.query(query, [messageId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToMessage(result.rows[0]);
    });
  }

  async updateMessageFlags(
    userId: string,
    messageId: string,
    flags: EmailFlag[],
  ): Promise<void> {
    return this.telemetry.withSpan("mail.updateMessageFlags", async (span) => {
      const query = `
        UPDATE messages 
        SET flags = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `;

      await this.db.query(query, [JSON.stringify(flags), messageId, userId]);
    });
  }

  async searchMessages(
    userId: string,
    searchParams: MailSearchRequest,
  ): Promise<MailSearchResponse> {
    return this.telemetry.withSpan("mail.searchMessages", async (span) => {
      const whereConditions: string[] = ["m.user_id = $1"];
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      if (searchParams.query) {
        whereConditions.push(
          `(m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex})`,
        );
        queryParams.push(`%${searchParams.query}%`);
        paramIndex++;
      }

      if (searchParams.folder) {
        whereConditions.push(`f.name = $${paramIndex}`);
        queryParams.push(searchParams.folder);
        paramIndex++;
      }

      if (searchParams.from) {
        whereConditions.push(`m.from_address ILIKE $${paramIndex}`);
        queryParams.push(`%${searchParams.from}%`);
        paramIndex++;
      }

      if (searchParams.subject) {
        whereConditions.push(`m.subject ILIKE $${paramIndex}`);
        queryParams.push(`%${searchParams.subject}%`);
        paramIndex++;
      }

      if (searchParams.dateFrom) {
        whereConditions.push(`m.date >= $${paramIndex}`);
        queryParams.push(searchParams.dateFrom);
        paramIndex++;
      }

      if (searchParams.dateTo) {
        whereConditions.push(`m.date <= $${paramIndex}`);
        queryParams.push(searchParams.dateTo);
        paramIndex++;
      }

      const limit = searchParams.limit || 50;
      const offset = searchParams.offset || 0;

      const query = `
        SELECT m.*, f.name as folder_name
        FROM messages m
        JOIN folders f ON m.folder_id = f.id
        WHERE ${whereConditions.join(" AND ")}
        ORDER BY m.date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const [messagesResult, countResult] = await Promise.all([
        this.db.query(query, queryParams),
        this.db.query(
          `SELECT COUNT(*) as total FROM messages m JOIN folders f ON m.folder_id = f.id WHERE ${whereConditions.join(" AND ")}`,
          queryParams.slice(0, -2), // Remove LIMIT and OFFSET
        ),
      ]);

      const messages = messagesResult.rows.map(this.mapRowToMessage);
      const total = parseInt(countResult.rows[0].total);

      return {
        messages,
        total,
        hasMore: offset + limit < total,
      };
    });
  }

  async getUserFolders(userId: string): Promise<EmailFolder[]> {
    return this.telemetry.withSpan("mail.getUserFolders", async (span) => {
      const query = `
        SELECT f.*, COUNT(m.id) as message_count,
               COUNT(CASE WHEN NOT (m.flags::jsonb ? 'seen') THEN 1 END) as unread_count
        FROM folders f
        LEFT JOIN messages m ON f.id = m.folder_id
        WHERE f.user_id = $1
        GROUP BY f.id
        ORDER BY f.type, f.name
      `;

      const result = await this.db.query(query, [userId]);

      return result.rows.map(this.mapRowToFolder);
    });
  }

  async composeFromMessage(
    userId: string,
    messageId: string,
    action: "reply" | "replyAll" | "forward",
    options: {
      includeAttachments?: boolean;
      inlineCidStrategy?: "preserve" | "flatten";
      selectedTextHtml?: string;
    } = {},
  ): Promise<{
    draftId: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    headers: {
      "In-Reply-To"?: string;
      References?: string[];
    };
    bodyHtml: string;
    attachmentsSizeExceeded: boolean;
  }> {
    return this.telemetry.withSpan("mail.composeFromMessage", async (span) => {
      // Security: Validate message access
      const originalMessage = await this.getMessage(userId, messageId);
      if (!originalMessage) {
        throw new Error("Original message not found");
      }

      // Get user's email for reply-all filtering
      const userEmail = await this.getUserEmail(userId);
      const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB total limit
      let attachmentsSizeExceeded = false;
      let attachments: string[] = [];

      // Audit logging
      await this.auditLog(userId, `compose_from_message_${action}`, {
        originalMessageId: messageId,
        action,
        includeAttachments: options.includeAttachments,
      });

      const composeDraft = {
        to: [] as string[],
        cc: [] as string[],
        bcc: [] as string[],
        subject: "",
        headers: {} as { "In-Reply-To"?: string; References?: string[] },
        bodyHtml: "",
        attachmentsSizeExceeded: false,
      };

      // Recipients logic
      switch (action) {
        case "reply":
          composeDraft.to = [originalMessage.from];
          composeDraft.subject = this.buildReplySubject(
            originalMessage.subject,
          );
          composeDraft.headers["In-Reply-To"] = originalMessage.messageId;
          composeDraft.headers.References = [
            ...(originalMessage.references || []),
            originalMessage.messageId,
          ];
          break;

        case "replyAll":
          composeDraft.to = [originalMessage.from];
          // Add original recipients except current user
          const allRecipients = [
            ...originalMessage.to,
            ...(originalMessage.cc || []),
          ];
          const otherRecipients = allRecipients.filter(
            (email) => email.toLowerCase() !== userEmail.toLowerCase(),
          );
          composeDraft.cc = this.deduplicateEmails(otherRecipients);
          composeDraft.subject = this.buildReplySubject(
            originalMessage.subject,
          );
          composeDraft.headers["In-Reply-To"] = originalMessage.messageId;
          composeDraft.headers.References = [
            ...(originalMessage.references || []),
            originalMessage.messageId,
          ];
          break;

        case "forward":
          composeDraft.subject = this.buildForwardSubject(
            originalMessage.subject,
          );

          // Handle attachments for forward
          if (
            options.includeAttachments &&
            originalMessage.attachments?.length > 0
          ) {
            const totalSize = await this.calculateAttachmentSize(
              originalMessage.attachments,
            );
            if (totalSize > MAX_ATTACHMENT_SIZE) {
              attachmentsSizeExceeded = true;
            } else {
              attachments = await this.processForwardAttachments(
                originalMessage.attachments,
                options.inlineCidStrategy || "preserve",
              );
            }
          }
          break;
      }

      // Security & sanitization - Build quoted body with HTML sanitization
      composeDraft.bodyHtml = await this.buildSanitizedQuotedBody(
        originalMessage,
        action,
        options.selectedTextHtml,
      );

      // Create draft in database
      const draftId = await this.createDraft(userId, {
        ...composeDraft,
        attachments,
      });

      return {
        draftId,
        ...composeDraft,
        attachmentsSizeExceeded,
      };
    });
  }

  private async auditLog(
    userId: string,
    action: string,
    details: any,
  ): Promise<void> {
    // Log to audit system - simplified for demo
    console.log(
      `AUDIT [${new Date().toISOString()}] User ${userId}: ${action}`,
      details,
    );
  }

  private async calculateAttachmentSize(
    attachments: EmailAttachment[],
  ): Promise<number> {
    // Calculate total size of all attachments
    return attachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
  }

  private async processForwardAttachments(
    attachments: EmailAttachment[],
    cidStrategy: "preserve" | "flatten",
  ): Promise<string[]> {
    // In real implementation, process CID references based on strategy
    // For preserve: maintain inline images as CID references
    // For flatten: convert inline images to regular attachments
    // Return attachment IDs for the draft
    return attachments.map((att) => att.id);
  }

  private deduplicateEmails(emails: string[]): string[] {
    const seen = new Set<string>();
    return emails.filter((email) => {
      const normalized = email.toLowerCase().trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  private async createDraft(userId: string, draftData: any): Promise<string> {
    // Create draft in database - simplified for demo
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // In real implementation, save to drafts table
    console.log(`Draft created: ${draftId} for user ${userId}`);

    return draftId;
  }

  private async buildSanitizedQuotedBody(
    originalMessage: EmailMessage,
    action: string,
    selectedTextHtml?: string,
  ): Promise<string> {
    const dateStr = originalMessage.date.toLocaleString();
    const fromStr = this.sanitizeHtml(originalMessage.from);
    const subjectStr = this.sanitizeHtml(originalMessage.subject);

    let quotedContent =
      selectedTextHtml ||
      originalMessage.htmlBody ||
      originalMessage.body ||
      "";

    // Sanitize HTML content
    quotedContent = this.sanitizeHtml(quotedContent);

    if (action === "forward") {
      const toStr = originalMessage.to
        .map((email) => this.sanitizeHtml(email))
        .join(", ");
      return `
        <br><br>
        <div style="border-top: 1px solid #ccc; padding-top: 10px;">
        <strong>---------- Forwarded message ----------</strong><br>
        <strong>From:</strong> ${fromStr}<br>
        <strong>Date:</strong> ${dateStr}<br>
        <strong>Subject:</strong> ${subjectStr}<br>
        <strong>To:</strong> ${toStr}<br>
        <br>
        ${quotedContent}
        </div>
      `.trim();
    } else {
      return `
        <br><br>
        <div style="border-left: 3px solid #ccc; padding-left: 15px; margin-left: 10px;">
        <p><strong>On ${dateStr}, ${fromStr} wrote:</strong></p>
        <blockquote style="margin: 0; padding: 0; color: #666;">
          ${quotedContent}
        </blockquote>
        </div>
      `.trim();
    }
  }

  private sanitizeHtml(input: string): string {
    if (!input) return "";

    // Basic HTML sanitization - in production use a proper library like DOMPurify
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }

  private async getUserEmail(userId: string): Promise<string> {
    // This should be implemented to get the user's email address
    // For now, return a placeholder
    return `user-${userId}@example.com`;
  }

  private buildReplySubject(originalSubject: string): string {
    if (originalSubject.toLowerCase().startsWith("re:")) {
      return originalSubject;
    }
    return `Re: ${originalSubject}`;
  }

  private buildForwardSubject(originalSubject: string): string {
    if (
      originalSubject.toLowerCase().startsWith("fwd:") ||
      originalSubject.toLowerCase().startsWith("fw:")
    ) {
      return originalSubject;
    }
    return `Fwd: ${originalSubject}`;
  }

  private buildQuotedBody(
    originalMessage: EmailMessage,
    action: string,
    selectedTextHtml?: string,
  ): string {
    const dateStr = originalMessage.date.toLocaleString();
    const fromStr = originalMessage.from;

    let quotedContent =
      selectedTextHtml ||
      originalMessage.htmlBody ||
      originalMessage.body ||
      "";

    if (action === "forward") {
      return `
        <br><br>
        ---------- Forwarded message ----------<br>
        From: ${fromStr}<br>
        Date: ${dateStr}<br>
        Subject: ${originalMessage.subject}<br>
        To: ${originalMessage.to.join(", ")}<br>
        <br>
        ${quotedContent}
      `;
    } else {
      return `
        <br><br>
        On ${dateStr}, ${fromStr} wrote:<br>
        <blockquote style="margin: 0 0 0 .8ex; border-left: 1px #ccc solid; padding-left: 1ex;">
          ${quotedContent}
        </blockquote>
      `;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&[^;]+;/g, " ")
      .trim();
  }

  private mapRowToMessage(row: any): EmailMessage {
    // Helper function to safely parse JSON or return the value if it's already parsed
    const safeJsonParse = (value: any, defaultValue: any = []) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return defaultValue;
        }
      }
      return value || defaultValue;
    };

    return {
      id: row.id,
      from: row.from,
      to: safeJsonParse(row.to, []),
      cc: safeJsonParse(row.cc, []),
      bcc: safeJsonParse(row.bcc, []),
      subject: row.subject,
      body: row.body,
      htmlBody: row.htmlBody,
      attachments: safeJsonParse(row.attachments, []),
      messageId: row.messageId,
      inReplyTo: row.inReplyTo,
      references: safeJsonParse(row.references, []),
      date: new Date(row.sentAt || row.date),
      flags: safeJsonParse(row.flags, []),
      labels: safeJsonParse(row.labels, []),
      folderId: row.folderId,
    };
  }

  private mapRowToFolder(row: any): EmailFolder {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      parentId: row.parent_id,
      type: row.type,
      messageCount: parseInt(row.message_count || "0"),
      unreadCount: parseInt(row.unread_count || "0"),
    };
  }
}
