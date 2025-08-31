import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../auth/middleware";
import { logAuditEvent } from "../auth/auth.service";

export const securityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /security/sessions - List active sessions for user
  fastify.get(
    "/security/sessions",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Security"],
        summary: "List user sessions and devices",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              sessions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    deviceInfo: { type: "string", nullable: true },
                    ipAddress: { type: "string" },
                    userAgent: { type: "string", nullable: true },
                    location: { type: "string", nullable: true },
                    isCurrent: { type: "boolean" },
                    lastActivity: { type: "string", format: "date-time" },
                    mfaLevel: { type: "string" },
                    amr: {
                      type: "array",
                      items: { type: "string" },
                    },
                    expiresAt: { type: "string", format: "date-time" },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
              trustedDevices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    userAgent: { type: "string", nullable: true },
                    ipAddress: { type: "string", nullable: true },
                    createdAt: { type: "string", format: "date-time" },
                    expiresAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub;
        const currentTokenJti = request.user!.jti;

        // Get active sessions
        const sessions = await fastify.prisma.session.findMany({
          where: {
            userId,
            isRevoked: false,
            expiresAt: {
              gte: new Date(),
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // Get trusted devices
        const trustedDevices = await fastify.prisma.trustedDevice.findMany({
          where: {
            userId,
            expiresAt: {
              gte: new Date(),
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // Format sessions for response
        const formattedSessions = sessions.map((session) => ({
          id: session.id,
          deviceInfo: session.deviceInfo,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          location: null, // TODO: Implement IP geolocation
          isCurrent: session.id === currentTokenJti, // This is simplified - in real implementation you'd track session IDs properly
          lastActivity: session.createdAt.toISOString(), // TODO: Track actual last activity
          mfaLevel: session.mfaLevel.toLowerCase(),
          amr: session.amr,
          expiresAt: session.expiresAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
        }));

        const formattedTrustedDevices = trustedDevices.map((device) => ({
          id: device.id,
          userAgent: device.userAgent,
          ipAddress: device.ipAddress,
          createdAt: device.createdAt.toISOString(),
          expiresAt: device.expiresAt.toISOString(),
        }));

        return reply.send({
          sessions: formattedSessions,
          trustedDevices: formattedTrustedDevices,
        });
      } catch (error) {
        console.error("Get sessions failed:", error);
        return reply.code(500).send({
          error: "Sessions Retrieval Failed",
          message: "Failed to retrieve sessions",
        });
      }
    },
  );

  // DELETE /security/sessions/:id - Revoke specific session
  fastify.delete(
    "/security/sessions/:id",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Security"],
        summary: "Revoke specific session",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { id: sessionId } = request.params;

        // Verify session belongs to user
        const session = await fastify.prisma.session.findFirst({
          where: {
            id: sessionId,
            userId,
            isRevoked: false,
          },
        });

        if (!session) {
          return reply.code(404).send({
            error: "Session Not Found",
            message: "Session not found or already revoked",
          });
        }

        // Revoke the session
        await fastify.prisma.session.update({
          where: { id: sessionId },
          data: { isRevoked: true },
        });

        await logAuditEvent(
          "security.session.revoked",
          "Session",
          sessionId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
          {
            revokedSession: {
              id: sessionId,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            },
          },
        );

        return reply.send({
          success: true,
          message: "Session revoked successfully",
        });
      } catch (error) {
        console.error("Revoke session failed:", error);
        return reply.code(500).send({
          error: "Revocation Failed",
          message: "Failed to revoke session",
        });
      }
    },
  );

  // POST /security/sessions/revoke-all - Revoke all user sessions except current
  fastify.post(
    "/security/sessions/revoke-all",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Security"],
        summary: "Revoke all user sessions except current",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              revokedCount: { type: "number" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub;
        const currentJti = request.user!.jti;

        // Get current session to exclude it
        // Note: This is simplified - in a real implementation you'd have better session tracking
        const currentSession = await fastify.prisma.session.findFirst({
          where: {
            userId,
            isRevoked: false,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // Revoke all other sessions
        const result = await fastify.prisma.session.updateMany({
          where: {
            userId,
            isRevoked: false,
            ...(currentSession ? { id: { not: currentSession.id } } : {}),
          },
          data: {
            isRevoked: true,
          },
        });

        await logAuditEvent(
          "security.sessions.revoked_all",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
          {
            revokedCount: result.count,
            keepCurrentSession: true,
          },
        );

        return reply.send({
          success: true,
          revokedCount: result.count,
          message: `Revoked ${result.count} sessions. Current session preserved.`,
        });
      } catch (error) {
        console.error("Revoke all sessions failed:", error);
        return reply.code(500).send({
          error: "Revocation Failed",
          message: "Failed to revoke sessions",
        });
      }
    },
  );

  // DELETE /security/trusted-devices/:id - Remove trusted device
  fastify.delete(
    "/security/trusted-devices/:id",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Security"],
        summary: "Remove trusted device",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { id: deviceId } = request.params;

        // Remove trusted device
        const result = await fastify.prisma.trustedDevice.deleteMany({
          where: {
            id: deviceId,
            userId,
          },
        });

        if (result.count === 0) {
          return reply.code(404).send({
            error: "Device Not Found",
            message: "Trusted device not found",
          });
        }

        await logAuditEvent(
          "security.trusted_device.removed",
          "TrustedDevice",
          deviceId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          success: true,
          message: "Trusted device removed successfully",
        });
      } catch (error) {
        console.error("Remove trusted device failed:", error);
        return reply.code(500).send({
          error: "Removal Failed",
          message: "Failed to remove trusted device",
        });
      }
    },
  );

  // GET /security/activity - Get security activity log
  fastify.get(
    "/security/activity",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Security"],
        summary: "Get user security activity",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "number", minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              activities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    action: { type: "string" },
                    result: { type: "string" },
                    ipAddress: { type: "string", nullable: true },
                    userAgent: { type: "string", nullable: true },
                    timestamp: { type: "string", format: "date-time" },
                    metadata: { type: "object", nullable: true },
                  },
                },
              },
              total: { type: "number" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: number;
          offset?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { limit = 20, offset = 0 } = request.query;

        // Get security-related audit events for the user
        const securityActions = [
          "auth.login_success",
          "auth.login_failed",
          "auth.logout",
          "mfa.totp.enabled",
          "mfa.challenge.success",
          "mfa.challenge.failed",
          "mfa.recovery.used",
          "mfa.device.trusted",
          "security.session.revoked",
          "security.sessions.revoked_all",
          "security.trusted_device.removed",
        ];

        const [activities, total] = await Promise.all([
          fastify.prisma.auditEvent.findMany({
            where: {
              actorId: userId,
              action: {
                in: securityActions,
              },
            },
            orderBy: {
              ts: "desc",
            },
            take: limit,
            skip: offset,
            select: {
              id: true,
              action: true,
              result: true,
              ip: true,
              userAgent: true,
              ts: true,
              metadata: true,
            },
          }),
          fastify.prisma.auditEvent.count({
            where: {
              actorId: userId,
              action: {
                in: securityActions,
              },
            },
          }),
        ]);

        const formattedActivities = activities.map((activity) => ({
          id: activity.id,
          action: activity.action,
          result: activity.result,
          ipAddress: activity.ip,
          userAgent: activity.userAgent,
          timestamp: activity.ts.toISOString(),
          metadata: activity.metadata,
        }));

        return reply.send({
          activities: formattedActivities,
          total,
          limit,
          offset,
        });
      } catch (error) {
        console.error("Get security activity failed:", error);
        return reply.code(500).send({
          error: "Activity Retrieval Failed",
          message: "Failed to retrieve security activity",
        });
      }
    },
  );
};
