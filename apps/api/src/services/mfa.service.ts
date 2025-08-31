import { PrismaClient } from "@prisma/client";
import { encryptionService } from "./encryption.service";
import { totpService } from "./totp.service";
import argon2 from "argon2";
import { FastifyInstance } from "fastify";
import { AuditService } from "./audit.service";
import { MetricsService } from "./metrics.service";
import { trackOtpAttempt } from "../auth/rate-limiter";

export class MFAService {
  private auditService: AuditService;
  private metricsService: MetricsService;

  constructor(
    private prisma: PrismaClient,
    private fastify?: FastifyInstance,
  ) {
    this.auditService = new AuditService(prisma);
    this.metricsService = new MetricsService(prisma, fastify?.redis);
  }

  /**
   * Starts TOTP setup process - generates secret but doesn't enable MFA yet
   */
  async startTOTPSetup(userId: string, userEmail: string) {
    try {
      // Check if user already has TOTP setup in progress or enabled
      const existingTotp = await this.prisma.userMfaTotp.findUnique({
        where: { userId },
      });

      // Generate new secret
      const secret = totpService.generateSecret();
      const { ciphertext, nonce } =
        await encryptionService.encryptSecret(secret);

      const totpData = {
        userId,
        secretCiphertext: ciphertext,
        secretNonce: nonce,
        label: userEmail,
        issuer: "CEERION",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      };

      if (existingTotp) {
        // Update existing setup
        await this.prisma.userMfaTotp.update({
          where: { userId },
          data: totpData,
        });
      } else {
        // Create new setup
        await this.prisma.userMfaTotp.create({
          data: totpData,
        });
      }

      // Generate setup info (without returning the secret)
      const setupInfo = totpService.generateSetupInfo(secret, userEmail);

      return {
        uri: setupInfo.uri,
        issuer: setupInfo.issuer,
        label: setupInfo.label,
        algorithm: setupInfo.algorithm,
        digits: setupInfo.digits,
        period: setupInfo.period,
      };
    } catch (error) {
      console.error("TOTP setup failed:", error);
      throw new Error("Failed to start TOTP setup");
    }
  }

  /**
   * Generates QR code for current TOTP setup
   */
  async getTOTPQRCode(userId: string, format: "png" | "svg" = "svg") {
    try {
      const totpRecord = await this.prisma.userMfaTotp.findUnique({
        where: { userId },
      });

      if (!totpRecord) {
        throw new Error("TOTP setup not found");
      }

      // Decrypt the secret
      const secret = await encryptionService.decryptSecret(
        totpRecord.secretCiphertext,
        totpRecord.secretNonce,
      );

      const uri = totpService.generateTOTPUri(secret, totpRecord.label);

      if (format === "png") {
        const qrBuffer = await totpService.generateQRCode(uri);
        return { type: "png", data: qrBuffer };
      } else {
        const qrSvg = await totpService.generateQRCodeSVG(uri);
        return { type: "svg", data: qrSvg };
      }
    } catch (error) {
      console.error("QR code generation failed:", error);
      throw new Error("Failed to generate QR code");
    }
  }

  /**
   * Verifies TOTP code and enables MFA if valid
   */
  async verifyAndEnableTOTP(userId: string, code: string) {
    try {
      if (!totpService.isValidTOTPFormat(code)) {
        throw new Error("Invalid TOTP code format");
      }

      const totpRecord = await this.prisma.userMfaTotp.findUnique({
        where: { userId },
      });

      if (!totpRecord) {
        throw new Error("TOTP setup not found");
      }

      // Decrypt the secret
      const secret = await encryptionService.decryptSecret(
        totpRecord.secretCiphertext,
        totpRecord.secretNonce,
      );

      // Verify the code
      const isValid = totpService.verifyTOTP(code, secret);
      if (!isValid) {
        throw new Error("Invalid TOTP code");
      }

      // Enable MFA for the user
      const now = new Date();
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaEnrolledAt: now,
          lastMfaAt: now,
        },
      });

      // Generate recovery codes
      const recoveryCodes = encryptionService.generateRecoveryCodes(10);
      const hashedCodes = await Promise.all(
        recoveryCodes.map((code) => encryptionService.hashRecoveryCode(code)),
      );

      // Store recovery codes
      await this.prisma.userMfaRecoveryCode.createMany({
        data: hashedCodes.map((hash) => ({
          userId,
          codeHash: hash,
        })),
      });

      return {
        success: true,
        recoveryCodes, // Return codes only once during setup
      };
    } catch (error) {
      console.error("TOTP verification failed:", error);
      throw error;
    }
  }

  /**
   * Challenges existing TOTP for authenticated users
   */
  async challengeTOTP(
    userId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      if (!totpService.isValidTOTPFormat(code)) {
        await this.auditService.logMfaVerifyFailed(
          userId,
          "Invalid TOTP code format",
          ipAddress,
          userAgent,
        );
        throw new Error("Invalid TOTP code format");
      }

      // Check if user has MFA enabled
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { mfaTotp: true },
      });

      if (!user || !user.mfaEnabled || !user.mfaTotp) {
        await this.auditService.logMfaVerifyFailed(
          userId,
          "MFA not enabled for user",
          ipAddress,
          userAgent,
        );
        throw new Error("MFA not enabled for user");
      }

      // Enhanced OTP lockout check
      if (this.fastify?.redis) {
        const lockoutKey = `otp_lockout:${userId}`;
        const lockoutData = await this.fastify.redis.get(lockoutKey);

        if (lockoutData) {
          const lockout = JSON.parse(lockoutData);
          if (
            lockout.lockedUntil &&
            new Date() < new Date(lockout.lockedUntil)
          ) {
            const remainingSeconds = Math.ceil(
              (new Date(lockout.lockedUntil).getTime() - Date.now()) / 1000,
            );
            throw new Error(
              `Account locked due to too many failed attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
            );
          }
        }
      }

      // Decrypt and verify TOTP
      const secret = await encryptionService.decryptSecret(
        user.mfaTotp.secretCiphertext,
        user.mfaTotp.secretNonce,
      );

      const isValid = totpService.verifyTOTP(code, secret);

      if (!isValid) {
        // Track failed attempt and check for lockout
        if (this.fastify?.redis) {
          const lockoutInfo = await trackOtpAttempt(
            userId,
            false,
            this.fastify.redis,
          );

          if (lockoutInfo?.lockedUntil) {
            await this.auditService.logMfaLockout(
              userId,
              lockoutInfo.attempts,
              300,
              ipAddress,
              userAgent,
            );
            await this.metricsService.recordLockout();
          }
        }

        await this.auditService.logMfaVerifyFailed(
          userId,
          "Invalid TOTP code",
          ipAddress,
          userAgent,
        );
        await this.metricsService.recordOtpChallenge(false);
        throw new Error("Invalid TOTP code");
      }

      // Clear failed attempts on success
      if (this.fastify?.redis) {
        await trackOtpAttempt(userId, true, this.fastify.redis);
      }

      // Update last MFA timestamp
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastMfaAt: new Date() },
      });

      // Log successful verification
      await this.auditService.logMfaVerifySuccess(userId, ipAddress, userAgent);
      await this.metricsService.recordOtpChallenge(true);

      return { success: true };
    } catch (error) {
      console.error("TOTP challenge failed:", error);
      throw error;
    }
  }

  /**
   * Verifies recovery code and marks it as used
   */
  async verifyRecoveryCode(
    userId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      // Get all unused recovery codes for user
      const recoveryCodes = await this.prisma.userMfaRecoveryCode.findMany({
        where: {
          userId,
          usedAt: null,
        },
      });

      if (recoveryCodes.length === 0) {
        await this.auditService.logEvent({
          event: "mfa.recovery.no_codes_available",
          actor: "User",
          actorId: userId,
          targetId: userId,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: "No recovery codes available",
        });
        throw new Error("No recovery codes available");
      }

      // Check code against all unused recovery codes
      for (const recoveryCode of recoveryCodes) {
        const isValid = await encryptionService.verifyRecoveryCode(
          code,
          recoveryCode.codeHash,
        );

        if (isValid) {
          // Mark recovery code as used
          await this.prisma.userMfaRecoveryCode.update({
            where: { id: recoveryCode.id },
            data: { usedAt: new Date() },
          });

          // Update last MFA timestamp
          await this.prisma.user.update({
            where: { id: userId },
            data: { lastMfaAt: new Date() },
          });

          // Clear any OTP lockouts since recovery code worked
          if (this.fastify?.redis) {
            await trackOtpAttempt(userId, true, this.fastify.redis);
          }

          // Log successful recovery code usage
          await this.auditService.logRecoveryCodeUsed(
            userId,
            recoveryCode.id,
            ipAddress,
            userAgent,
          );
          await this.metricsService.recordRecoveryCodeUsage();

          return { success: true };
        }
      }

      // Log failed recovery code attempt
      await this.auditService.logEvent({
        event: "mfa.recovery.invalid_code",
        actor: "User",
        actorId: userId,
        targetId: userId,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: "Invalid recovery code",
      });

      throw new Error("Invalid recovery code");
    } catch (error) {
      console.error("Recovery code verification failed:", error);
      throw error;
    }
  }

  /**
   * Generates new recovery codes (invalidates old ones)
   */
  async regenerateRecoveryCodes(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      // Delete existing recovery codes
      await this.prisma.userMfaRecoveryCode.deleteMany({
        where: { userId },
      });

      // Generate new codes
      const recoveryCodes = encryptionService.generateRecoveryCodes(10);
      const hashedCodes = await Promise.all(
        recoveryCodes.map((code) => encryptionService.hashRecoveryCode(code)),
      );

      // Store new recovery codes
      await this.prisma.userMfaRecoveryCode.createMany({
        data: hashedCodes.map((hash) => ({
          userId,
          codeHash: hash,
        })),
      });

      // Log recovery codes regeneration
      await this.auditService.logRecoveryCodesRegenerated(
        userId,
        ipAddress,
        userAgent,
      );

      return recoveryCodes;
    } catch (error) {
      console.error("Recovery code regeneration failed:", error);
      throw new Error("Failed to regenerate recovery codes");
    }
  }

  /**
   * Creates or updates trusted device
   */
  async trustDevice(
    userId: string,
    userAgent: string,
    ipAddress: string,
    rememberDays: number = 30,
  ) {
    try {
      const deviceHash = encryptionService.generateDeviceHash(
        userAgent,
        ipAddress,
        userId,
      );
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + rememberDays);

      // Remove existing trusted device with same hash
      await this.prisma.trustedDevice.deleteMany({
        where: { userId, deviceHash },
      });

      // Create new trusted device
      const trustedDevice = await this.prisma.trustedDevice.create({
        data: {
          userId,
          deviceHash,
          userAgent,
          ipAddress,
          expiresAt,
        },
      });

      // Log device trust
      await this.auditService.logDeviceTrusted(
        userId,
        deviceHash,
        rememberDays,
        ipAddress,
        userAgent,
      );
      await this.metricsService.recordTrustedDevice();

      return trustedDevice;
    } catch (error) {
      console.error("Device trust failed:", error);
      throw new Error("Failed to trust device");
    }
  }

  /**
   * Checks if device is trusted and not expired
   */
  async isDeviceTrusted(
    userId: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<boolean> {
    try {
      const deviceHash = encryptionService.generateDeviceHash(
        userAgent,
        ipAddress,
        userId,
      );

      const trustedDevice = await this.prisma.trustedDevice.findFirst({
        where: {
          userId,
          deviceHash,
          expiresAt: {
            gte: new Date(),
          },
        },
      });

      return !!trustedDevice;
    } catch (error) {
      console.error("Device trust check failed:", error);
      return false;
    }
  }

  /**
   * Removes all trusted devices for user
   */
  async removeAllTrustedDevices(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      // Count devices before deletion for audit
      const deviceCount = await this.prisma.trustedDevice.count({
        where: { userId },
      });

      await this.prisma.trustedDevice.deleteMany({
        where: { userId },
      });

      // Log trusted devices removal
      await this.auditService.logTrustedDevicesCleared(
        userId,
        deviceCount,
        ipAddress,
        userAgent,
      );
    } catch (error) {
      console.error("Remove trusted devices failed:", error);
      throw new Error("Failed to remove trusted devices");
    }
  }

  /**
   * Disables MFA for user (admin break-glass function)
   */
  async disableMFA(
    userId: string,
    disabledBy: "User" | "Admin",
    disabledById: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      // Delete TOTP setup
      await this.prisma.userMfaTotp.deleteMany({
        where: { userId },
      });

      // Delete recovery codes
      await this.prisma.userMfaRecoveryCode.deleteMany({
        where: { userId },
      });

      // Remove trusted devices
      await this.prisma.trustedDevice.deleteMany({
        where: { userId },
      });

      // Clear any OTP lockouts
      if (this.fastify?.redis) {
        await this.fastify.redis.del(`otp_lockout:${userId}`);
      }

      // Disable MFA on user
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaEnrolledAt: null,
          lastMfaAt: null,
        },
      });

      // Log MFA disabled
      await this.auditService.logMfaDisabled(
        userId,
        disabledBy,
        disabledById,
        reason,
        ipAddress,
        userAgent,
      );

      return { success: true };
    } catch (error) {
      console.error("MFA disable failed:", error);
      throw new Error("Failed to disable MFA");
    }
  }
}

export function createMFAService(
  prisma: PrismaClient,
  fastify?: FastifyInstance,
) {
  return new MFAService(prisma, fastify);
}
