import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, validateBody } from "../auth/middleware";
import { createEnhancedRateLimiter } from "../auth/rate-limiter";
import { createMFAService } from "../services/mfa.service";
import { generateAccessToken, upgradeSessionMFA } from "../auth/auth.service";
import { logAuditEvent } from "../auth/auth.service";

// Schema definitions
const setupTOTPSchema = z.object({});

const verifyTOTPSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

const mfaChallengeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

const recoveryCodeSchema = z.object({
  code: z
    .string()
    .regex(/^[A-F0-9]{4}-[A-F0-9]{4}$/, "Invalid recovery code format"),
});

const trustDeviceSchema = z.object({
  remember: z.boolean().default(true),
});

export const mfaRoutes: FastifyPluginAsync = async (fastify) => {
  const mfaService = createMFAService(fastify.prisma, fastify);

  // Rate limiters with OTP lockout support
  const mfaRateLimit = createEnhancedRateLimiter({
    max: 5,
    timeWindow: 300, // 5 minutes
    keyGenerator: (req) => `mfa:${req.user?.sub || req.ip}`,
    otpLockout: {
      maxAttempts: 6,
      lockoutDuration: 300, // 5 minutes
    },
  });

  const setupRateLimit = createEnhancedRateLimiter({
    max: 3,
    timeWindow: 600, // 10 minutes
    keyGenerator: (req) => `mfa_setup:${req.user?.sub || req.ip}`,
  });

  // POST /auth/mfa/totp/setup/start - Start TOTP setup
  fastify.post(
    "/auth/mfa/totp/setup/start",
    {
      preHandler: [requireAuth, setupRateLimit, validateBody(setupTOTPSchema)],
      schema: {
        tags: ["MFA"],
        summary: "Start TOTP setup process",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              uri: { type: "string" },
              issuer: { type: "string" },
              label: { type: "string" },
              algorithm: { type: "string" },
              digits: { type: "number" },
              period: { type: "number" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub;
        const userEmail = request.user!.email;

        const setupInfo = await mfaService.startTOTPSetup(userId, userEmail);

        await logAuditEvent(
          "mfa.totp.setup_started",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send(setupInfo);
      } catch (error) {
        console.error("TOTP setup start failed:", error);
        return reply.code(400).send({
          error: "Setup Failed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to start TOTP setup",
        });
      }
    },
  );

  // GET /auth/mfa/totp/qr - Get QR code for TOTP setup
  fastify.get(
    "/auth/mfa/totp/qr",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["MFA"],
        summary: "Get TOTP QR code",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["svg", "png"], default: "svg" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              type: { type: "string" },
              data: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { format?: "svg" | "png" };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const format = request.query.format || "svg";

        const qrCode = await mfaService.getTOTPQRCode(userId, format);

        if (format === "png") {
          reply.type("image/png");
          return reply.send(qrCode.data);
        } else {
          reply.type("image/svg+xml");
          return reply.send(qrCode.data);
        }
      } catch (error) {
        console.error("QR code generation failed:", error);
        return reply.code(404).send({
          error: "Not Found",
          message: "TOTP setup not found or QR code generation failed",
        });
      }
    },
  );

  // POST /auth/mfa/totp/verify - Verify TOTP and enable MFA
  fastify.post(
    "/auth/mfa/totp/verify",
    {
      preHandler: [requireAuth, mfaRateLimit, validateBody(verifyTOTPSchema)],
      schema: {
        tags: ["MFA"],
        summary: "Verify TOTP code and enable MFA",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", pattern: "^\\d{6}$" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              recoveryCodes: {
                type: "array",
                items: { type: "string" },
              },
              accessToken: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { code: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { code } = request.body;

        const result = await mfaService.verifyAndEnableTOTP(userId, code);

        // Generate new access token with MFA
        const user = request.user!;
        const accessToken = generateAccessToken(
          {
            id: user.sub,
            email: user.email,
            name: user.name,
          },
          {
            amr: ["pwd", "otp"],
            mfaLevel: "otp",
          },
        );

        await logAuditEvent(
          "mfa.totp.enabled",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          success: true,
          recoveryCodes: result.recoveryCodes,
          accessToken,
          message:
            "MFA enabled successfully. Save your recovery codes in a secure location.",
        });
      } catch (error) {
        console.error("TOTP verification failed:", error);

        await logAuditEvent(
          "mfa.totp.verify_failed",
          "User",
          request.user!.sub,
          request.ip,
          request.headers["user-agent"] || null,
          request.user!.sub,
        );

        return reply.code(400).send({
          error: "Verification Failed",
          message:
            error instanceof Error ? error.message : "TOTP verification failed",
        });
      }
    },
  );

  // POST /auth/mfa/challenge - Challenge MFA for authenticated users
  fastify.post(
    "/auth/mfa/challenge",
    {
      preHandler: [requireAuth, mfaRateLimit, validateBody(mfaChallengeSchema)],
      schema: {
        tags: ["MFA"],
        summary: "Complete MFA challenge",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", pattern: "^\\d{6}$" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              accessToken: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { code: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { code } = request.body;
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"] || "";

        await mfaService.challengeTOTP(userId, code, ipAddress, userAgent);

        // Generate new access token with MFA
        const user = request.user!;
        const accessToken = generateAccessToken(
          {
            id: user.sub,
            email: user.email,
            name: user.name,
          },
          {
            amr: ["pwd", "otp"],
            mfaLevel: "otp",
          },
        );

        await logAuditEvent(
          "mfa.challenge.success",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          success: true,
          accessToken,
          message: "MFA challenge completed successfully",
        });
      } catch (error) {
        console.error("MFA challenge failed:", error);

        await logAuditEvent(
          "mfa.challenge.failed",
          "User",
          request.user!.sub,
          request.ip,
          request.headers["user-agent"] || null,
          request.user!.sub,
        );

        return reply.code(400).send({
          error: "Challenge Failed",
          message:
            error instanceof Error ? error.message : "MFA challenge failed",
        });
      }
    },
  );

  // POST /auth/mfa/recovery/verify - Verify recovery code
  fastify.post(
    "/auth/mfa/recovery/verify",
    {
      preHandler: [requireAuth, mfaRateLimit, validateBody(recoveryCodeSchema)],
      schema: {
        tags: ["MFA"],
        summary: "Verify MFA recovery code",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", pattern: "^[A-F0-9]{4}-[A-F0-9]{4}$" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              accessToken: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { code: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { code } = request.body;
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"] || "";

        await mfaService.verifyRecoveryCode(
          userId,
          code.toUpperCase(),
          ipAddress,
          userAgent,
        );

        // Generate new access token with MFA
        const user = request.user!;
        const accessToken = generateAccessToken(
          {
            id: user.sub,
            email: user.email,
            name: user.name,
          },
          {
            amr: ["pwd", "otp"],
            mfaLevel: "otp",
          },
        );

        await logAuditEvent(
          "mfa.recovery.used",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          success: true,
          accessToken,
          message: "Recovery code verified successfully",
        });
      } catch (error) {
        console.error("Recovery code verification failed:", error);

        await logAuditEvent(
          "mfa.recovery.failed",
          "User",
          request.user!.sub,
          request.ip,
          request.headers["user-agent"] || null,
          request.user!.sub,
        );

        return reply.code(400).send({
          error: "Verification Failed",
          message:
            error instanceof Error
              ? error.message
              : "Recovery code verification failed",
        });
      }
    },
  );

  // POST /auth/mfa/recovery/generate - Generate new recovery codes
  fastify.post(
    "/auth/mfa/recovery/generate",
    {
      preHandler: [requireAuth, mfaRateLimit],
      schema: {
        tags: ["MFA"],
        summary: "Generate new recovery codes",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              recoveryCodes: {
                type: "array",
                items: { type: "string" },
              },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub;
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"] || "";

        // Verify user has MFA enabled
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { mfaEnabled: true },
        });

        if (!user?.mfaEnabled) {
          return reply.code(400).send({
            error: "MFA Not Enabled",
            message: "MFA must be enabled to generate recovery codes",
          });
        }

        const recoveryCodes = await mfaService.regenerateRecoveryCodes(
          userId,
          ipAddress,
          userAgent,
        );

        await logAuditEvent(
          "mfa.recovery.regenerated",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          recoveryCodes,
          message: "New recovery codes generated. Store them securely.",
        });
      } catch (error) {
        console.error("Recovery code generation failed:", error);
        return reply.code(500).send({
          error: "Generation Failed",
          message: "Failed to generate recovery codes",
        });
      }
    },
  );

  // POST /auth/mfa/trusted-device - Mark device as trusted
  fastify.post(
    "/auth/mfa/trusted-device",
    {
      preHandler: [requireAuth, validateBody(trustDeviceSchema)],
      schema: {
        tags: ["MFA"],
        summary: "Mark device as trusted",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            remember: { type: "boolean", default: true },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              expiresAt: { type: "string", format: "date-time" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { remember?: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = request.user!.sub;
        const { remember = true } = request.body;

        if (!remember) {
          return reply.send({
            success: false,
            message: "Device not marked as trusted",
          });
        }

        // Check MFA level
        if (request.user!.mfa_level === "none") {
          return reply.code(400).send({
            error: "MFA Required",
            message: "Complete MFA challenge before marking device as trusted",
          });
        }

        // Get organization policy for remember days
        const orgPolicy = await fastify.prisma.orgPolicy.findFirst();
        const rememberDays = orgPolicy?.rememberDeviceDays || 30;

        const userAgent = request.headers["user-agent"] || "";
        const ipAddress = request.ip;

        const trustedDevice = await mfaService.trustDevice(
          userId,
          userAgent,
          ipAddress,
          rememberDays,
        );

        await logAuditEvent(
          "mfa.device.trusted",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        // Set signed HTTP-only cookie
        const deviceToken = `${trustedDevice.id}:${trustedDevice.deviceHash}`;
        reply.setCookie("trusted_device", deviceToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: rememberDays * 24 * 60 * 60 * 1000, // Convert days to milliseconds
          path: "/",
        });

        return reply.send({
          success: true,
          expiresAt: trustedDevice.expiresAt.toISOString(),
          message: `Device trusted for ${rememberDays} days`,
        });
      } catch (error) {
        console.error("Device trust failed:", error);
        return reply.code(500).send({
          error: "Trust Failed",
          message: "Failed to mark device as trusted",
        });
      }
    },
  );

  // DELETE /auth/mfa/trusted-devices - Remove all trusted devices
  fastify.delete(
    "/auth/mfa/trusted-devices",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["MFA"],
        summary: "Remove all trusted devices",
        security: [{ bearerAuth: [] }],
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub;
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"] || "";

        await mfaService.removeAllTrustedDevices(userId, ipAddress, userAgent);

        // Clear trusted device cookie
        reply.clearCookie("trusted_device", { path: "/" });

        await logAuditEvent(
          "mfa.devices.removed_all",
          "User",
          userId,
          request.ip,
          request.headers["user-agent"] || null,
          userId,
        );

        return reply.send({
          success: true,
          message: "All trusted devices removed",
        });
      } catch (error) {
        console.error("Remove trusted devices failed:", error);
        return reply.code(500).send({
          error: "Removal Failed",
          message: "Failed to remove trusted devices",
        });
      }
    },
  );
};
