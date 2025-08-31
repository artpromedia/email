import { FastifyPluginAsync } from "fastify";
import { getTelemetry } from "@ceerion/observability";
import { MailService } from "../services/mail.service";
import { QueueService } from "../services/queue.service";
import {
  SendMailRequest,
  SendMailResponse,
  MailMessage,
  MailFolder,
  MailSearchRequest,
  MailSearchResponse,
  EmailFlag,
} from "@ceerion/shared";

const mailRoutes: FastifyPluginAsync = async (fastify) => {
  const telemetry = getTelemetry();
  const mailService = new MailService(fastify.db, telemetry);
  const queueService = new QueueService(fastify.db, fastify.redis, telemetry);

  // Send mail endpoint - enqueue to submission
  fastify.post<{ Body: SendMailRequest }>(
    "/send",
    {
      schema: {
        body: {
          type: "object",
          required: ["to", "subject"],
          properties: {
            to: {
              type: "array",
              items: { type: "string", format: "email" },
              minItems: 1,
              maxItems: 100,
            },
            cc: {
              type: "array",
              items: { type: "string", format: "email" },
              maxItems: 100,
            },
            bcc: {
              type: "array",
              items: { type: "string", format: "email" },
              maxItems: 100,
            },
            subject: { type: "string", maxLength: 998 },
            body: { type: "string", maxLength: 10485760 }, // 10MB
            htmlBody: { type: "string", maxLength: 10485760 },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filename: { type: "string" },
                  contentType: { type: "string" },
                  content: { type: "string" }, // base64 encoded
                  size: { type: "number" },
                },
                required: ["filename", "contentType", "content"],
              },
              maxItems: 10,
            },
            priority: {
              type: "string",
              enum: ["low", "normal", "high"],
              default: "normal",
            },
            scheduleAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request, reply): Promise<SendMailResponse> => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const {
        to,
        cc,
        bcc,
        subject,
        body,
        htmlBody,
        attachments,
        priority = "normal",
        scheduleAt,
      } = request.body;

      return await telemetry.withSpan("mail-send-operation", async (span) => {
        span.setAttributes({
          "mail.recipient_count": to.length,
          "mail.has_cc": Boolean(cc?.length),
          "mail.has_bcc": Boolean(bcc?.length),
          "mail.has_attachments": Boolean(attachments?.length),
          "mail.priority": priority,
          "mail.user_id": user.sub,
        });

        try {
          // Calculate total message size
          const messageSize =
            Buffer.byteLength(body || "", "utf8") +
            (attachments?.reduce(
              (sum: number, att: any) => sum + (att.size || 0),
              0,
            ) || 0);

          // Check size limits
          if (messageSize > 52428800) {
            // 50MB
            throw new Error("Message size exceeds limit");
          }

          // Queue the email for delivery
          const result = await queueService.enqueueEmail(
            {
              to,
              cc,
              bcc,
              subject,
              body,
              htmlBody,
              attachments,
              priority,
              scheduleAt: scheduleAt ? new Date(scheduleAt) : undefined,
            },
            user.sub,
            priority,
          );

          // Record metrics
          telemetry.recordMailOperation("send", "success", user.sub);

          return {
            messageId: result.messageId,
            queueId: result.queueId,
            status: scheduleAt ? "scheduled" : "queued",
          };
        } catch (error) {
          telemetry.recordMailOperation("send", "failure", user.sub);
          throw error;
        }
      });
    },
  );

  // List mail messages
  fastify.get<{
    Querystring: {
      folder?: string;
      limit?: number;
      offset?: number;
      unread?: boolean;
    };
  }>(
    "/messages",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            folder: { type: "string" },
            limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "number", minimum: 0, default: 0 },
            unread: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { folder, limit = 50, offset = 0 } = request.query;

      return await telemetry.withSpan("mail-list-operation", async (span) => {
        try {
          const messages = await mailService.getUserMessages(
            user.sub,
            folder,
            limit,
            offset,
          );
          telemetry.recordMailOperation("list", "success", user.sub);
          return { messages, total: messages.length };
        } catch (error) {
          telemetry.recordMailOperation("list", "failure", user.sub);
          throw error;
        }
      });
    },
  );

  // Get single mail message
  fastify.get<{ Params: { messageId: string } }>(
    "/message/:messageId",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            messageId: { type: "string" },
          },
          required: ["messageId"],
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { messageId } = request.params;

      return await telemetry.withSpan("mail-read-operation", async (span) => {
        try {
          const message = await mailService.getMessage(user.sub, messageId);

          if (!message) {
            return reply.notFound("Message not found");
          }

          // Mark as read if not already seen
          if (!message.flags.includes(EmailFlag.SEEN)) {
            await mailService.updateMessageFlags(user.sub, messageId, [
              ...message.flags,
              EmailFlag.SEEN,
            ]);
          }

          telemetry.recordMailOperation("read", "success", user.sub);
          return message;
        } catch (error) {
          telemetry.recordMailOperation("read", "failure", user.sub);
          throw error;
        }
      });
    },
  );

  // Update message flags
  fastify.patch<{
    Params: { messageId: string };
    Body: { flags: EmailFlag[] };
  }>(
    "/message/:messageId/flags",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            messageId: { type: "string" },
          },
          required: ["messageId"],
        },
        body: {
          type: "object",
          properties: {
            flags: {
              type: "array",
              items: {
                type: "string",
                enum: Object.values(EmailFlag),
              },
            },
          },
          required: ["flags"],
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { messageId } = request.params;
      const { flags } = request.body;

      try {
        await mailService.updateMessageFlags(user.sub, messageId, flags);
        telemetry.recordMailOperation("read", "success", user.sub);
        return { success: true };
      } catch (error) {
        telemetry.recordMailOperation("read", "failure", user.sub);
        throw error;
      }
    },
  );

  // Search messages
  fastify.post<{ Body: MailSearchRequest }>(
    "/search",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            query: { type: "string" },
            folder: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            subject: { type: "string" },
            hasAttachment: { type: "boolean" },
            dateFrom: { type: "string", format: "date-time" },
            dateTo: { type: "string", format: "date-time" },
            flags: {
              type: "array",
              items: {
                type: "string",
                enum: Object.values(EmailFlag),
              },
            },
            limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "number", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply): Promise<MailSearchResponse> => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const searchParams = { ...request.body };

      return await telemetry.withSpan("mail-search-operation", async (span) => {
        try {
          const result = await mailService.searchMessages(
            user.sub,
            searchParams,
          );
          telemetry.recordMailOperation("read", "success", user.sub);
          return result;
        } catch (error) {
          telemetry.recordMailOperation("read", "failure", user.sub);
          throw error;
        }
      });
    },
  );

  // Get user folders
  fastify.get("/folders", async (request, reply) => {
    const user = request.user;
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      const folders = await mailService.getUserFolders(user.sub);
      return { folders };
    } catch (error) {
      throw error;
    }
  });

  // Compose from message (reply/reply-all/forward)
  fastify.post<{
    Body: {
      messageId: string;
      action: "reply" | "replyAll" | "forward";
      includeAttachments?: boolean;
      inlineCidStrategy?: "preserve" | "flatten";
      selectedTextHtml?: string;
    };
  }>(
    "/compose/from-message",
    {
      schema: {
        body: {
          type: "object",
          required: ["messageId", "action"],
          properties: {
            messageId: { type: "string" },
            action: { type: "string", enum: ["reply", "replyAll", "forward"] },
            includeAttachments: { type: "boolean" },
            inlineCidStrategy: {
              type: "string",
              enum: ["preserve", "flatten"],
            },
            selectedTextHtml: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const {
        messageId,
        action,
        includeAttachments,
        inlineCidStrategy,
        selectedTextHtml,
      } = request.body;

      try {
        telemetry.recordMailOperation("compose", "success", user.sub);

        const composeDraft = await mailService.composeFromMessage(
          user.sub,
          messageId,
          action,
          {
            includeAttachments: includeAttachments || false,
            inlineCidStrategy: inlineCidStrategy || "preserve",
            selectedTextHtml,
          },
        );

        telemetry.recordMailOperation("compose", "success", user.sub);
        return composeDraft;
      } catch (error) {
        telemetry.recordMailOperation("compose", "failure", user.sub);
        throw error;
      }
    },
  );
};

export { mailRoutes };
export default mailRoutes;
