import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { logAudit, AuditLogger } from "../../utils/audit-logger";

// Schema definitions
const maintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
  duration: z.number().optional(), // minutes
});

const systemConfigSchema = z.object({
  maxFileSize: z.number().min(1).optional(),
  sessionTimeout: z.number().min(5).max(1440).optional(), // 5 min to 24 hours
  maxLoginAttempts: z.number().min(1).max(10).optional(),
  backupRetention: z.number().min(1).max(365).optional(), // days
});

const backupConfigSchema = z.object({
  type: z.enum(["full", "incremental"]),
  schedule: z.string().optional(),
  retention: z.number().min(1).max(365).optional(),
});

export async function adminSystemRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // POST /admin/system/maintenance - Toggle maintenance mode
  fastify.post(
    "/admin/system/maintenance",
    {
      schema: {

        summary: "Toggle maintenance mode",
        description: "Enable or disable system maintenance mode",
        body: {
          type: "object",
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
            message: { type: "string", maxLength: 500 },
            duration: { type: "number", minimum: 1, maximum: 1440 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof maintenanceModeSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { enabled, message, duration } = request.body;
      const currentUser = request.user!;

      try {
        // Validate input
        maintenanceModeSchema.parse(request.body);

        // TODO: Update system configuration in database
        // await updateSystemConfig({ maintenanceMode: { enabled, message, duration } });

        const maintenanceConfig = {
          enabled,
          message:
            message || (enabled ? "System is under maintenance" : undefined),
          duration: duration,
          scheduledEnd: duration
            ? new Date(Date.now() + duration * 60000)
            : undefined,
          updatedAt: new Date(),
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: enabled
            ? "system.maintenance_enable"
            : "system.maintenance_disable",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "maintenance_mode",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            maintenanceMode: maintenanceConfig,
            previousState: !enabled, // opposite of current
          },
        });

        return {
          message: `Maintenance mode ${enabled ? "enabled" : "disabled"}`,
          maintenanceMode: maintenanceConfig,
        };
      } catch (error: any) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: enabled
            ? "system.maintenance_enable"
            : "system.maintenance_disable",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "maintenance_mode",
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            attemptedConfig: { enabled, message, duration },
          },
        });

        if (error?.name === "ZodError") {
          throw fastify.httpErrors.badRequest(
            "Invalid maintenance mode configuration",
          );
        }

        fastify.log.error("Failed to toggle maintenance mode", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to update maintenance mode",
        );
      }
    },
  );

  // PUT /admin/system/config - Update system configuration
  fastify.put(
    "/admin/system/config",
    {
      schema: {

        summary: "Update system configuration",
        description: "Update global system settings",
        body: {
          type: "object",
          properties: {
            maxFileSize: { type: "number", minimum: 1 },
            sessionTimeout: { type: "number", minimum: 5, maximum: 1440 },
            maxLoginAttempts: { type: "number", minimum: 1, maximum: 10 },
            backupRetention: { type: "number", minimum: 1, maximum: 365 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof systemConfigSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const configUpdates = request.body;
      const currentUser = request.user!;

      try {
        // Validate input
        systemConfigSchema.parse(configUpdates);

        // TODO: Update system configuration in database
        // const currentConfig = await getSystemConfig();
        // await updateSystemConfig(configUpdates);

        const mockCurrentConfig = {
          maxFileSize: 100, // MB
          sessionTimeout: 30, // minutes
          maxLoginAttempts: 5,
          backupRetention: 30, // days
        };

        const updatedConfig = {
          ...mockCurrentConfig,
          ...configUpdates,
          updatedAt: new Date(),
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.config_update",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "global_config",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            previousConfig: mockCurrentConfig,
            newConfig: updatedConfig,
            changedFields: Object.keys(configUpdates),
          },
        });

        return {
          message: "System configuration updated successfully",
          config: updatedConfig,
        };
      } catch (error: any) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.config_update",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "global_config",
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            attemptedChanges: configUpdates,
          },
        });

        if (error?.name === "ZodError") {
          throw fastify.httpErrors.badRequest("Invalid system configuration");
        }

        fastify.log.error("Failed to update system configuration", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to update system configuration",
        );
      }
    },
  );

  // POST /admin/system/backup - Trigger system backup
  fastify.post(
    "/admin/system/backup",
    {
      schema: {

        summary: "Trigger system backup",
        description: "Manually trigger a system backup",
        body: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["full", "incremental"] },
            schedule: { type: "string" },
            retention: { type: "number", minimum: 1, maximum: 365 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof backupConfigSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { type = "full", schedule, retention = 30 } = request.body;
      const currentUser = request.user!;

      try {
        // Validate input
        backupConfigSchema.parse({ type, schedule, retention });

        // TODO: Trigger actual backup process
        // const backupId = await triggerBackup(type, { schedule, retention });

        const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const backupInfo = {
          id: backupId,
          type,
          status: "initiated",
          startedAt: new Date(),
          retention,
          estimatedDuration: type === "full" ? "2-4 hours" : "30-60 minutes",
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.backup_trigger",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: backupId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            backupType: type,
            backupId,
            retention,
            schedule,
            triggeredAt: new Date().toISOString(),
          },
        });

        return reply.code(202).send({
          message: `${type} backup initiated successfully`,
          backup: backupInfo,
        });
      } catch (error: any) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.backup_trigger",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "unknown",
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            attemptedBackup: { type, schedule, retention },
          },
        });

        if (error?.name === "ZodError") {
          throw fastify.httpErrors.badRequest("Invalid backup configuration");
        }

        fastify.log.error("Failed to trigger backup", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to trigger backup",
        );
      }
    },
  );

  // GET /admin/system/health - Get system health status
  fastify.get(
    "/admin/system/health",
    {
      schema: {

        summary: "Get system health",
        description: "Get detailed system health and status information",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      try {
        // TODO: Get actual system health metrics
        const healthStatus = {
          status: "healthy",
          timestamp: new Date(),
          services: {
            database: { status: "healthy", responseTime: "12ms" },
            redis: { status: "healthy", responseTime: "3ms" },
            mailQueue: { status: "healthy", pending: 15 },
            storage: { status: "healthy", usage: "45%" },
            backup: {
              status: "healthy",
              lastBackup: new Date(Date.now() - 86400000),
            },
          },
          metrics: {
            uptime: "15d 8h 32m",
            cpu: "23%",
            memory: "1.2GB / 4GB",
            disk: "450GB / 1TB",
            activeUsers: 147,
            emailsProcessed24h: 2847,
          },
        };

        // Log audit event for sensitive health data access
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.health_view",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "health_status",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            systemStatus: healthStatus.status,
            accessedAt: new Date().toISOString(),
          },
        });

        return healthStatus;
      } catch (error: any) {
        fastify.log.error("Failed to fetch system health", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch system health",
        );
      }
    },
  );

  // POST /admin/system/security/reset-sessions - Reset all user sessions
  fastify.post(
    "/admin/system/security/reset-sessions",
    {
      schema: {

        summary: "Reset all user sessions",
        description:
          "Force logout all users by invalidating all sessions (emergency security measure)",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      try {
        // TODO: Invalidate all sessions in Redis/database
        // await invalidateAllSessions();

        const resetInfo = {
          resetAt: new Date(),
          affectedSessions: 147, // mock count
          excludedAdminSession: currentUser.sub, // keep current admin logged in
        };

        // Log critical audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.security_reset_sessions",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "all_sessions",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            affectedSessions: resetInfo.affectedSessions,
            resetReason: "admin_initiated",
            emergencyAction: true,
            resetTimestamp: resetInfo.resetAt.toISOString(),
          },
        });

        return {
          message: "All user sessions have been reset successfully",
          details: resetInfo,
          warning: "All users except current admin will be logged out",
        };
      } catch (error: any) {
        // Log audit failure for critical security action
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "system.security_reset_sessions",
          resourceType: AuditLogger.ResourceTypes.SYSTEM,
          resourceId: "all_sessions",
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            emergencyAction: true,
            failedAt: new Date().toISOString(),
          },
        });

        fastify.log.error("Failed to reset user sessions", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to reset user sessions",
        );
      }
    },
  );
}
