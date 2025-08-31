import * as OTPAuth from "otplib";
import * as QRCode from "qrcode";
import { loadEnv } from "../config/env";

const env = loadEnv();

/**
 * TOTP (Time-based One-Time Password) Service
 * SHA1, 6 digits, 30s window, ±1 step tolerance
 */
export class TOTPService {
  private readonly issuer = env.BRAND_NAME;
  private readonly algorithm = "SHA1";
  private readonly digits = 6;
  private readonly period = 30;
  private readonly window = 1; // ±30 seconds tolerance

  /**
   * Generates a new TOTP secret
   */
  generateSecret(): string {
    return OTPAuth.authenticator.generateSecret(20); // 160-bit secret
  }

  /**
   * Generates TOTP URI for QR code
   */
  generateTOTPUri(secret: string, userEmail: string): string {
    return OTPAuth.authenticator.keyuri(userEmail, this.issuer, secret);
  }

  /**
   * Generates QR code as PNG buffer
   */
  async generateQRCode(otpUri: string): Promise<Buffer> {
    try {
      const qrBuffer = await QRCode.toBuffer(otpUri, {
        type: "png",
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      return qrBuffer;
    } catch (error) {
      console.error("QR code generation failed:", error);
      throw new Error("Failed to generate QR code");
    }
  }

  /**
   * Generates QR code as SVG string
   */
  async generateQRCodeSVG(otpUri: string): Promise<string> {
    try {
      const svg = await QRCode.toString(otpUri, {
        type: "svg",
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      return svg;
    } catch (error) {
      console.error("QR SVG generation failed:", error);
      throw new Error("Failed to generate QR SVG");
    }
  }

  /**
   * Generates TOTP code for given secret at current time
   */
  generateTOTP(secret: string): string {
    return OTPAuth.authenticator.generate(secret);
  }

  /**
   * Verifies TOTP code against secret with time window tolerance
   */
  verifyTOTP(code: string, secret: string): boolean {
    try {
      // Verify with current time ±1 window (±30 seconds)
      const isValid = OTPAuth.authenticator.verify({
        token: code,
        secret: secret,
        window: this.window,
      });

      return isValid;
    } catch (error) {
      console.error("TOTP verification failed:", error);
      return false;
    }
  }

  /**
   * Gets the current TOTP time step
   * Used for preventing replay attacks
   */
  getCurrentTimeStep(): number {
    return Math.floor(Date.now() / 1000 / this.period);
  }

  /**
   * Validates TOTP code format
   */
  isValidTOTPFormat(code: string): boolean {
    return /^\d{6}$/.test(code);
  }

  /**
   * Gets remaining time until next TOTP code
   */
  getRemainingTime(): number {
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / this.period);
    const nextStep = (timeStep + 1) * this.period;
    return nextStep - now;
  }

  /**
   * Generates backup information for TOTP setup
   */
  generateSetupInfo(secret: string, userEmail: string) {
    return {
      secret,
      issuer: this.issuer,
      label: userEmail,
      algorithm: this.algorithm,
      digits: this.digits,
      period: this.period,
      uri: this.generateTOTPUri(secret, userEmail),
    };
  }
}

export const totpService = new TOTPService();
