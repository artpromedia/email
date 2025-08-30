import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { hashPassword } from "../../auth/auth.service";
import { logAudit, AuditLogger } from "../../utils/audit-logger";

// Schema definitions
const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});

const updateUserStatusSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["enable", "suspend"]),
});

const resetUserPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  enabled: z.boolean().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

export async function adminUserRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // PATCH /admin/users/:id - Enable/disable or change role
  fastify.patch(
    "/admin/users/:id",
    {
      schema: {
        tags: ["Admin", "Users"],
        summary: "Enable/disable user or change role",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { enabled?: boolean; role?: "user" | "admin" };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: userId } = request.params;
      const { enabled, role } = request.body;
      const currentUser = request.user!;

      try {
        // Get the target user
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          throw fastify.httpErrors.notFound("User not found");
        }

        // Prepare update data
        const dbUpdateData: any = {};
        let action = "";
        let metadata: any = { targetUser: targetUser.email };

        if (enabled !== undefined) {
          const isSuspended = !enabled;
          const previousStatus = targetUser.isSuspended
            ? "suspended"
            : "active";
          dbUpdateData.isSuspended = isSuspended;
          action = enabled ? "user.enable" : "user.disable";
          metadata.previousStatus = previousStatus;
          metadata.newStatus = isSuspended ? "suspended" : "active";
        }

        if (role !== undefined) {
          const previousRole = targetUser.isAdmin ? "admin" : "user";
          const newIsAdmin = role === "admin";
          dbUpdateData.isAdmin = newIsAdmin;
          action = "user.role_change";
          metadata.previousRole = previousRole;
          metadata.newRole = role;
        }

        // Update the user
        const updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: dbUpdateData,
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: action,
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: metadata,
        });

        return {
          message: "User updated successfully",
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            isAdmin: updatedUser.isAdmin,
            isSuspended: updatedUser.isSuspended,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action:
            enabled !== undefined
              ? enabled
                ? "user.enable"
                : "user.disable"
              : "user.role_change",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            attemptedChanges: { enabled, role },
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/users/:id/role - Update user role
  fastify.put(
    "/admin/users/:id/role",
    {
      schema: {
        tags: ["Admin", "Users"],
        summary: "Update user role",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { role: "user" | "admin" };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: userId } = request.params;
      const { role } = request.body;
      const currentUser = request.user!;

      try {
        // Get the target user
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          throw fastify.httpErrors.notFound("User not found");
        }

        const previousRole = targetUser.isAdmin ? "admin" : "user";
        const newIsAdmin = role === "admin";

        // Update the user role
        const updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: { isAdmin: newIsAdmin },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.USER_ROLE_CHANGE,
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            targetUser: targetUser.email,
            previousRole,
            newRole: role,
          },
        });

        return {
          message: "User role updated successfully",
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            isAdmin: updatedUser.isAdmin,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.USER_ROLE_CHANGE,
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            targetRole: role,
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/users/:id/status - Enable/suspend user
  fastify.put(
    "/admin/users/:id/status",
    {
      schema: {
        tags: ["Admin", "Users"],
        summary: "Enable or suspend user",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { action: "enable" | "suspend" };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: userId } = request.params;
      const { action } = request.body;
      const currentUser = request.user!;

      try {
        // Get the target user
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          throw fastify.httpErrors.notFound("User not found");
        }

        const isSuspended = action === "suspend";
        const previousStatus = targetUser.isSuspended ? "suspended" : "active";

        // Update the user status
        const updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: { isSuspended },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action:
            action === "enable"
              ? AuditLogger.Actions.USER_ENABLE
              : AuditLogger.Actions.USER_SUSPEND,
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            targetUser: targetUser.email,
            previousStatus,
            newStatus: isSuspended ? "suspended" : "active",
          },
        });

        return {
          message: `User ${action}d successfully`,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            isSuspended: updatedUser.isSuspended,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action:
            action === "enable"
              ? AuditLogger.Actions.USER_ENABLE
              : AuditLogger.Actions.USER_SUSPEND,
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            targetAction: action,
          },
        });

        throw error;
      }
    },
  );

  // POST /admin/users/:id/reset-password - Reset user password
  fastify.post(
    "/admin/users/:id/reset-password",
    {
      schema: {
        tags: ["Admin", "Users"],
        summary: "Reset user password",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { newPassword: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: userId } = request.params;
      const { newPassword } = request.body;
      const currentUser = request.user!;

      try {
        // Get the target user
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          throw fastify.httpErrors.notFound("User not found");
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update the user password
        await fastify.prisma.user.update({
          where: { id: userId },
          data: { passwordHash: hashedPassword },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "user.reset_password",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            targetUser: targetUser.email,
            resetMethod: "admin_initiated",
          },
        });

        return {
          message: "User password reset successfully",
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "user.reset_password",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            resetMethod: "admin_initiated",
          },
        });

        throw error;
      }
    },
  );
}
