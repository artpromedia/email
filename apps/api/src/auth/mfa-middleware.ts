import { FastifyRequest, FastifyReply } from "fastify";
import { createMFAService } from "../services/mfa.service";

/**
 * Middleware to enforce MFA requirements based on organization policy
 */
export const mfaEnforcementMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  // Skip for unauthenticated requests
  if (!request.user) {
    return;
  }

  try {
    // Get organization policy
    const orgPolicy = await request.server.prisma.orgPolicy.findFirst();

    // If no policy or MFA not required, allow through
    if (!orgPolicy || !orgPolicy.requireMfa) {
      return;
    }

    const userId = request.user.sub;
    const userAgent = request.headers["user-agent"] || "";
    const ipAddress = request.ip;

    // Check if device is trusted and hasn't expired
    const mfaService = createMFAService(request.server.prisma, request.server);
    const isDeviceTrusted = await mfaService.isDeviceTrusted(
      userId,
      userAgent,
      ipAddress,
    );

    // If device is trusted, allow through
    if (isDeviceTrusted) {
      return;
    }

    // Check if user has completed MFA for this session
    const sessionMfaLevel = request.user.mfa_level;

    if (sessionMfaLevel === "none") {
      // Get user's MFA status
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: {
          mfaEnabled: true,
          mfaEnrolledAt: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "User not found",
        });
      }

      // Check grace period
      if (user.mfaEnrolledAt) {
        // User has MFA enabled, must complete challenge
        return reply.code(401).send({
          error: "MFA Required",
          reason: "mfa_required",
          message:
            "Multi-factor authentication is required to access this resource",
          enrolled: true,
        });
      } else {
        // Check if grace period has expired
        const gracePeriodEnd = new Date(user.createdAt);
        gracePeriodEnd.setDate(
          gracePeriodEnd.getDate() + orgPolicy.gracePeriodDays,
        );

        if (new Date() > gracePeriodEnd) {
          // Grace period expired, user must enroll in MFA
          return reply.code(401).send({
            error: "MFA Enrollment Required",
            reason: "mfa_required",
            message:
              "You must enroll in multi-factor authentication to continue",
            enrolled: false,
            gracePeriodExpired: true,
          });
        }
        // Within grace period, allow through
      }
    }
  } catch (error) {
    console.error("MFA enforcement error:", error);
    // In case of error, fail closed if policy requires MFA
    const orgPolicy = await request.server.prisma.orgPolicy.findFirst();
    if (orgPolicy?.requireMfa) {
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Unable to verify MFA requirements",
      });
    }
  }
};

/**
 * Helper middleware to require MFA for specific routes
 */
export const requireMFA = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const mfaLevel = request.user.mfa_level;

  if (mfaLevel === "none") {
    return reply.code(401).send({
      error: "MFA Required",
      reason: "mfa_required",
      message: "Multi-factor authentication is required for this action",
    });
  }
};

/**
 * Helper to check if user can skip MFA due to trusted device
 */
export const checkTrustedDevice = async (
  request: FastifyRequest,
): Promise<boolean> => {
  if (!request.user) {
    return false;
  }

  try {
    const userId = request.user.sub;
    const userAgent = request.headers["user-agent"] || "";
    const ipAddress = request.ip;

    const mfaService = createMFAService(request.server.prisma);
    return await mfaService.isDeviceTrusted(userId, userAgent, ipAddress);
  } catch (error) {
    console.error("Trusted device check failed:", error);
    return false;
  }
};
