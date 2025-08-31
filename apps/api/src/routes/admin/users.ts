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

  // POST /admin/users - Create new user
  fastify.post(
    "/admin/users",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "firstName", "lastName", "role"],
          properties: {
            email: { type: "string", format: "email" },
            firstName: { type: "string", minLength: 1 },
            lastName: { type: "string", minLength: 1 },
            role: { type: "string", enum: ["user", "admin"] },
            quotaLimit: { type: "number", minimum: 0 },
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          email: string;
          firstName: string;
          lastName: string;
          role: "user" | "admin";
          quotaLimit?: number;
          enabled?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        email,
        firstName,
        lastName,
        role,
        quotaLimit = 10240,
        enabled = true,
      } = request.body;
      const currentUser = request.user!;

      try {
        // Check if user already exists
        const existingUser = await fastify.prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          return reply.status(409).send({
            error: "Conflict",
            message: "User with this email already exists",
          });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";
        const hashedPassword = await hashPassword(tempPassword);

        // Create the user
        const newUser = await fastify.prisma.user.create({
          data: {
            email,
            name: `${firstName} ${lastName}`,
            passwordHash: hashedPassword,
            isAdmin: role === "admin",
            isSuspended: !enabled,
            emailVerified: false, // User needs to verify email
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "user.create",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: newUser.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            createdUser: {
              email: newUser.email,
              name: newUser.name,
              role: role,
              enabled: enabled,
              quotaLimit: quotaLimit,
            },
          },
        });

        return reply.code(201).send({
          message: "User created successfully",
          user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: role,
            enabled: enabled,
            quotaLimit: quotaLimit,
            createdAt: newUser.createdAt,
          },
          tempPassword, // Include temporary password for admin to share
        });
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "user.create",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: "unknown",
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: (error as Error)?.message || "Unknown error",
            attemptedUserData: { email, firstName, lastName, role },
          },
        });

        throw error;
      }
    },
  );

  // DELETE /admin/users/:id - Delete user
  fastify.delete(
    "/admin/users/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
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
      const { id: userId } = request.params;
      const currentUser = request.user!;

      try {
        // Get the target user first
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          return reply.status(404).send({
            error: "Not Found",
            message: "User not found",
          });
        }

        // Prevent self-deletion
        if (targetUser.id === currentUser.sub) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Cannot delete your own account",
          });
        }

        // Delete the user (cascade should handle related data)
        await fastify.prisma.user.delete({
          where: { id: userId },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "user.delete",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            deletedUser: {
              email: targetUser.email,
              name: targetUser.name,
              role: targetUser.isAdmin ? "admin" : "user",
              wasEnabled: !targetUser.isSuspended,
            },
          },
        });

        return {
          message: "User deleted successfully",
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "user.delete",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: (error as Error)?.message || "Unknown error",
          },
        });

        throw error;
      }
    },
  );

  // PATCH /admin/users/:id - General user updates (name, email, etc.)
  fastify.patch(
    "/admin/users/:id",
    {
      schema: {},
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          email?: string;
          enabled?: boolean;
          role?: "user" | "admin";
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: userId } = request.params;
      let updateData = request.body;
      const currentUser = request.user!;
      let action = "user.update"; // Declare outside try block for error handling

      try {
        // Get the target user
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!targetUser) {
          return reply.status(404).send({
            error: "Not Found",
            message: "User not found",
          });
        }

        // Determine audit action based on what's being updated
        let metadata: any = {
          targetUser: targetUser.email,
          changedFields: {},
        };

        // Prepare data for Prisma update
        let prismaData: any = {};

        // Handle enabled/disabled status changes
        if (updateData.enabled !== undefined) {
          const isSuspended = !updateData.enabled;
          const previousStatus = targetUser.isSuspended
            ? "suspended"
            : "active";
          action = updateData.enabled ? "user.enable" : "user.disable";
          metadata.previousStatus = previousStatus;
          metadata.newStatus = isSuspended ? "suspended" : "active";

          prismaData.isSuspended = isSuspended;
        }

        // Handle role changes
        if (updateData.role !== undefined) {
          const previousRole = targetUser.isAdmin ? "admin" : "user";
          action = "user.role_change";
          metadata.previousRole = previousRole;
          metadata.newRole = updateData.role;

          prismaData.isAdmin = updateData.role === "admin";
        }

        // Handle general field updates
        if (updateData.name || updateData.email) {
          if (updateData.name && updateData.name !== targetUser.name) {
            metadata.changedFields.name = {
              from: targetUser.name,
              to: updateData.name,
            };
          }
          if (updateData.email && updateData.email !== targetUser.email) {
            metadata.changedFields.email = {
              from: targetUser.email,
              to: updateData.email,
            };
          }
        }

        // Update the user
        const updatedUser = await fastify.prisma.user.update({
          where: { id: userId },
          data: prismaData,
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
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
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: action || "user.update",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: errorMessage,
            attemptedChanges: updateData,
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
      schema: {},
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
          return reply.status(404).send({
            error: "Not Found",
            message: "User not found",
          });
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
          actorId: currentUser.sub,
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
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "user.reset_password",
          resourceType: AuditLogger.ResourceTypes.USER,
          resourceId: userId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
            resetMethod: "admin_initiated",
          },
        });

        throw error;
      }
    },
  );
}
