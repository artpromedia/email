import {
  EmailMessage,
  EmailFolder,
  EmailFlag,
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
        JOIN folders f ON m.folder_id = f.id
        WHERE m.id = $1 AND m.user_id = $2
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
  ): Promise<any> {
    return this.telemetry.withSpan("mail.composeFromMessage", async (span) => {
      // Get the original message
      const originalMessage = await this.getMessage(userId, messageId);
      if (!originalMessage) {
        throw new Error("Original message not found");
      }

      const composeDraft: any = {
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        body: "",
        htmlBody: "",
        attachments: [],
        inReplyTo: null,
        references: [],
      };

      switch (action) {
        case "reply":
          composeDraft.to = [originalMessage.from];
          composeDraft.subject = this.buildReplySubject(
            originalMessage.subject,
          );
          composeDraft.inReplyTo = originalMessage.messageId;
          composeDraft.references = [
            ...(originalMessage.references || []),
            originalMessage.messageId,
          ];
          break;

        case "replyAll":
          composeDraft.to = [originalMessage.from];
          // Add original to/cc recipients except the current user
          const allRecipients = [
            ...originalMessage.to,
            ...(originalMessage.cc || []),
          ];
          const userEmail = await this.getUserEmail(userId);
          const otherRecipients = allRecipients.filter(
            (email) => email !== userEmail,
          );
          composeDraft.cc = otherRecipients;
          composeDraft.subject = this.buildReplySubject(
            originalMessage.subject,
          );
          composeDraft.inReplyTo = originalMessage.messageId;
          composeDraft.references = [
            ...(originalMessage.references || []),
            originalMessage.messageId,
          ];
          break;

        case "forward":
          composeDraft.subject = this.buildForwardSubject(
            originalMessage.subject,
          );
          if (options.includeAttachments && originalMessage.attachments) {
            composeDraft.attachments = [...originalMessage.attachments];
          }
          break;
      }

      // Build the quoted body
      composeDraft.htmlBody = this.buildQuotedBody(
        originalMessage,
        action,
        options.selectedTextHtml,
      );
      composeDraft.body = this.stripHtml(composeDraft.htmlBody);

      return composeDraft;
    });
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
    return {
      id: row.id,
      from: row.from_address,
      to: JSON.parse(row.to_addresses || "[]"),
      cc: JSON.parse(row.cc_addresses || "[]"),
      bcc: JSON.parse(row.bcc_addresses || "[]"),
      subject: row.subject,
      body: row.body,
      htmlBody: row.html_body,
      attachments: JSON.parse(row.attachments || "[]"),
      messageId: row.message_id,
      inReplyTo: row.in_reply_to,
      references: JSON.parse(row.references || "[]"),
      date: new Date(row.date),
      flags: JSON.parse(row.flags || "[]"),
      labels: JSON.parse(row.labels || "[]"),
      folderId: row.folder_id,
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
