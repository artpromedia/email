import { PrismaClient } from "@prisma/client";

export type AuditLogParams = {
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result?: "SUCCESS" | "FAILURE";
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
};

export class AuditLogger {
  constructor(private prisma: PrismaClient) {}

  /**
   * Log an audit event
   */
  async logAudit(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          result: params.result || "SUCCESS",
          ip: params.ip,
          userAgent: params.userAgent,
          metadata: params.metadata || undefined,
        },
      });
    } catch (error) {
      // Log audit failure but don't throw to avoid breaking the main operation
      console.error("Failed to log audit event:", error);
    }
  }

  /**
   * Extract IP and User-Agent from Fastify request
   */
  extractRequestInfo(request: any): Pick<AuditLogParams, "ip" | "userAgent"> {
    return {
      ip:
        request.ip ||
        request.headers["x-forwarded-for"] ||
        request.connection?.remoteAddress,
      userAgent: request.headers["user-agent"],
    };
  }

  /**
   * Common audit actions
   */
  static readonly Actions = {
    // User management
    USER_CREATE: "user.create",
    USER_UPDATE: "user.update",
    USER_DELETE: "user.delete",
    USER_SUSPEND: "user.suspend",
    USER_ENABLE: "user.enable",
    USER_ROLE_CHANGE: "user.role_change",
    USER_PASSWORD_RESET: "user.password_reset",

    // Policy management
    POLICY_CREATE: "policy.create",
    POLICY_UPDATE: "policy.update",
    POLICY_DELETE: "policy.delete",
    POLICY_SAVE: "policy.save",

    // Quarantine management
    QUARANTINE_RELEASE: "quarantine.release",
    QUARANTINE_DELETE: "quarantine.delete",

    // DKIM management
    DKIM_ROTATE: "dkim.rotate",

    // System management
    SYSTEM_MAINTENANCE_ENABLE: "system.maintenance_enable",
    SYSTEM_MAINTENANCE_DISABLE: "system.maintenance_disable",
    SYSTEM_CONFIG_UPDATE: "system.config_update",
    SYSTEM_BACKUP_TRIGGER: "system.backup_trigger",
    SYSTEM_HEALTH_VIEW: "system.health_view",
    SYSTEM_SECURITY_RESET_SESSIONS: "system.security_reset_sessions",

    // Authentication
    AUTH_LOGIN: "auth.login",
    AUTH_LOGOUT: "auth.logout",
    AUTH_FAILED: "auth.failed",
  } as const;

  /**
   * Common resource types
   */
  static readonly ResourceTypes = {
    USER: "user",
    POLICY: "policy",
    QUARANTINE: "quarantine",
    DELIVERABILITY: "deliverability",
    DKIM: "dkim",
    SESSION: "session",
    SYSTEM: "system",
  } as const;
}

// Global audit logger instance
let auditLogger: AuditLogger | null = null;

export function initializeAuditLogger(prisma: PrismaClient): AuditLogger {
  auditLogger = new AuditLogger(prisma);
  return auditLogger;
}

export function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    throw new Error(
      "Audit logger not initialized. Call initializeAuditLogger first.",
    );
  }
  return auditLogger;
}

/**
 * Convenience function for logging audit events
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  const logger = getAuditLogger();
  await logger.logAudit(params);
}
