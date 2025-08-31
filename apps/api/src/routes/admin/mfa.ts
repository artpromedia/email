import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin, validateBody } from "../../auth/middleware";
import { createMFAService } from "../../services/mfa.service";
import { logAuditEvent } from "../../auth/auth.service";

// Schema definitions
const disableMFASchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

const orgPolicySchema = z.object({
  requireMfa: z.boolean(),
  gracePeriodDays: z.number().min(0).max(365),
  rememberDeviceDays: z.number().min(0).max(365),
});

export const adminMFARoutes: FastifyPluginAsync = async (fastify) => {
  const mfaService = createMFAService(fastify.prisma, fastify);

  // POST /admin/users/:id/mfa/disable - Break-glass MFA disable
  fastify.post(
    "/admin/users/:id/mfa/disable",
    {
      preHandler: [requireAdmin, validateBody(disableMFASchema)],
      schema: {
        tags: ["Admin", "MFA"],
        summary: "Disable MFA for user (break-glass)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 10 },
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
        Body: { reason: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id: userId } = request.params;
        const { reason } = request.body;
        const adminUser = request.user!;

        // Verify target user exists
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, mfaEnabled: true },
        });

        if (!targetUser) {
          return reply.code(404).send({
            error: "User Not Found",
            message: "Target user not found",
          });
        }

        if (!targetUser.mfaEnabled) {
          return reply.code(400).send({
            error: "MFA Not Enabled",
            message: "User does not have MFA enabled",
          });
        }

        // Disable MFA
        await mfaService.disableMFA(userId);

        // Revoke all user sessions to force re-authentication
        await fastify.prisma.session.updateMany({
          where: { userId, isRevoked: false },
          data: { isRevoked: true },
        });

        await logAuditEvent(
          "admin.mfa.disabled",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          adminUser.sub,
          {
            targetUser: targetUser.email,
            reason,
            adminAction: true,
          },
        );

        return reply.send({
          success: true,
          message: `MFA disabled for user ${targetUser.email}. All sessions revoked.`,
        });
      } catch (error) {
        console.error("Admin MFA disable failed:", error);

        await logAuditEvent(
          "admin.mfa.disable_failed",
          "User",
          request.params.id,
          request.ip,
          request.headers["user-agent"] || null,
          request.user!.sub,
          {
            error: error instanceof Error ? error.message : "Unknown error",
            reason: request.body.reason,
          },
        );

        return reply.code(500).send({
          error: "Disable Failed",
          message: "Failed to disable MFA for user",
        });
      }
    },
  );

  // GET /admin/mfa/policy - Get organization MFA policy
  fastify.get(
    "/admin/mfa/policy",
    {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin", "MFA"],
        summary: "Get organization MFA policy",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              requireMfa: { type: "boolean" },
              gracePeriodDays: { type: "number" },
              rememberDeviceDays: { type: "number" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let orgPolicy = await fastify.prisma.orgPolicy.findFirst();

        if (!orgPolicy) {
          // Create default policy if none exists
          orgPolicy = await fastify.prisma.orgPolicy.create({
            data: {
              requireMfa: false,
              gracePeriodDays: 7,
              rememberDeviceDays: 30,
            },
          });
        }

        return reply.send(orgPolicy);
      } catch (error) {
        console.error("Get MFA policy failed:", error);
        return reply.code(500).send({
          error: "Policy Retrieval Failed",
          message: "Failed to retrieve MFA policy",
        });
      }
    },
  );

  // PUT /admin/mfa/policy - Update organization MFA policy
  fastify.put(
    "/admin/mfa/policy",
    {
      preHandler: [requireAdmin, validateBody(orgPolicySchema)],
      schema: {
        tags: ["Admin", "MFA"],
        summary: "Update organization MFA policy",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["requireMfa", "gracePeriodDays", "rememberDeviceDays"],
          properties: {
            requireMfa: { type: "boolean" },
            gracePeriodDays: { type: "number", minimum: 0, maximum: 365 },
            rememberDeviceDays: { type: "number", minimum: 0, maximum: 365 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              requireMfa: { type: "boolean" },
              gracePeriodDays: { type: "number" },
              rememberDeviceDays: { type: "number" },
              updatedAt: { type: "string", format: "date-time" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          requireMfa: boolean;
          gracePeriodDays: number;
          rememberDeviceDays: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { requireMfa, gracePeriodDays, rememberDeviceDays } =
          request.body;
        const adminUser = request.user!;

        // Get existing policy or create default
        let orgPolicy = await fastify.prisma.orgPolicy.findFirst();

        if (!orgPolicy) {
          orgPolicy = await fastify.prisma.orgPolicy.create({
            data: {
              requireMfa,
              gracePeriodDays,
              rememberDeviceDays,
            },
          });
        } else {
          orgPolicy = await fastify.prisma.orgPolicy.update({
            where: { id: orgPolicy.id },
            data: {
              requireMfa,
              gracePeriodDays,
              rememberDeviceDays,
            },
          });
        }

        await logAuditEvent(
          "admin.mfa.policy_updated",
          "System",
          orgPolicy.id,
          request.ip,
          request.headers["user-agent"] || null,
          adminUser.sub,
          {
            policy: {
              requireMfa,
              gracePeriodDays,
              rememberDeviceDays,
            },
            adminAction: true,
          },
        );

        return reply.send({
          requireMfa: orgPolicy.requireMfa,
          gracePeriodDays: orgPolicy.gracePeriodDays,
          rememberDeviceDays: orgPolicy.rememberDeviceDays,
          updatedAt: orgPolicy.updatedAt.toISOString(),
          message: "MFA policy updated successfully",
        });
      } catch (error) {
        console.error("Update MFA policy failed:", error);

        await logAuditEvent(
          "admin.mfa.policy_update_failed",
          "System",
          null,
          request.ip,
          request.headers["user-agent"] || null,
          request.user!.sub,
          {
            error: error instanceof Error ? error.message : "Unknown error",
            attemptedPolicy: request.body,
          },
        );

        return reply.code(500).send({
          error: "Policy Update Failed",
          message: "Failed to update MFA policy",
        });
      }
    },
  );

  // GET /admin/mfa/stats - Get MFA adoption statistics
  fastify.get(
    "/admin/mfa/stats",
    {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin", "MFA"],
        summary: "Get MFA adoption statistics",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              totalUsers: { type: "number" },
              mfaEnabled: { type: "number" },
              mfaDisabled: { type: "number" },
              adoptionRate: { type: "number" },
              recentEnrollments: { type: "number" },
              trustedDevices: { type: "number" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [
          totalUsers,
          mfaEnabledUsers,
          recentEnrollments,
          trustedDevicesCount,
        ] = await Promise.all([
          fastify.prisma.user.count({
            where: { isDeleted: false },
          }),
          fastify.prisma.user.count({
            where: {
              isDeleted: false,
              mfaEnabled: true,
            },
          }),
          fastify.prisma.user.count({
            where: {
              isDeleted: false,
              mfaEnabled: true,
              mfaEnrolledAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
              },
            },
          }),
          fastify.prisma.trustedDevice.count({
            where: {
              expiresAt: {
                gte: new Date(),
              },
            },
          }),
        ]);

        const mfaDisabled = totalUsers - mfaEnabledUsers;
        const adoptionRate =
          totalUsers > 0 ? (mfaEnabledUsers / totalUsers) * 100 : 0;

        return reply.send({
          totalUsers,
          mfaEnabled: mfaEnabledUsers,
          mfaDisabled,
          adoptionRate: Math.round(adoptionRate * 100) / 100, // Round to 2 decimal places
          recentEnrollments,
          trustedDevices: trustedDevicesCount,
        });
      } catch (error) {
        console.error("Get MFA stats failed:", error);
        return reply.code(500).send({
          error: "Stats Retrieval Failed",
          message: "Failed to retrieve MFA statistics",
        });
      }
    },
  );

  // GET /admin/users/:id/mfa/status - Get user's MFA status
  fastify.get(
    "/admin/users/:id/mfa/status",
    {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin", "MFA"],
        summary: "Get user MFA status",
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
              mfaEnabled: { type: "boolean" },
              mfaEnrolledAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              lastMfaAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              recoveryCodes: { type: "number" },
              trustedDevices: { type: "number" },
              totpConfigured: { type: "boolean" },
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
        const { id: userId } = request.params;

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: {
            mfaEnabled: true,
            mfaEnrolledAt: true,
            lastMfaAt: true,
            mfaTotp: true,
            _count: {
              select: {
                mfaRecoveryCodes: {
                  where: { usedAt: null },
                },
                trustedDevices: {
                  where: {
                    expiresAt: { gte: new Date() },
                  },
                },
              },
            },
          },
        });

        if (!user) {
          return reply.code(404).send({
            error: "User Not Found",
            message: "User not found",
          });
        }

        return reply.send({
          mfaEnabled: user.mfaEnabled,
          mfaEnrolledAt: user.mfaEnrolledAt?.toISOString() || null,
          lastMfaAt: user.lastMfaAt?.toISOString() || null,
          recoveryCodes: user._count.mfaRecoveryCodes,
          trustedDevices: user._count.trustedDevices,
          totpConfigured: !!user.mfaTotp,
        });
      } catch (error) {
        console.error("Get user MFA status failed:", error);
        return reply.code(500).send({
          error: "Status Retrieval Failed",
          message: "Failed to retrieve user MFA status",
        });
      }
    },
  );
};
