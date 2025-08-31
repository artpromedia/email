import * as crypto from "crypto";
import { loadEnv } from "../config/env";

const env = loadEnv();

/**
 * AES-256-GCM Envelope Encryption Service for TOTP Secrets
 * Uses KMS key in production, environment key in development
 */
export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  private readonly tagLength = 16; // 128 bits
  private readonly keyLength = 32; // 256 bits

  /**
   * Derives encryption key from master key using PBKDF2
   */
  private deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(masterKey, salt, 100000, this.keyLength, "sha512");
  }

  /**
   * Gets the master encryption key
   * In production: retrieves from KMS
   * In development: uses environment variable
   */
  private async getMasterKey(): Promise<string> {
    if (env.NODE_ENV === "production" && env.KMS_ENDPOINT) {
      // In production, use KMS to get the key
      try {
        const response = await fetch(
          `${env.KMS_ENDPOINT}/keys/mfa-encryption`,
          {
            headers: {
              Authorization: `Bearer ${process.env.KMS_TOKEN}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`KMS error: ${response.status}`);
        }

        const { key } = await response.json();
        return key;
      } catch (error) {
        console.error("Failed to retrieve key from KMS:", error);
        throw new Error("Encryption key unavailable");
      }
    } else {
      // Development: use environment key
      return env.MFA_ENCRYPTION_KEY;
    }
  }

  /**
   * Encrypts a TOTP secret using AES-256-GCM
   * Returns encrypted data and nonce for storage
   */
  async encryptSecret(
    secret: string,
  ): Promise<{ ciphertext: Buffer; nonce: Buffer }> {
    try {
      const masterKey = await this.getMasterKey();

      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);

      // Derive encryption key
      const key = this.deriveKey(masterKey, salt);

      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(salt); // Use salt as additional authenticated data

      // Encrypt the secret
      let encrypted = cipher.update(secret, "utf8");
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt + iv + tag + encrypted data
      const ciphertext = Buffer.concat([salt, iv, tag, encrypted]);

      // Create nonce (combining salt and iv for reference)
      const nonce = Buffer.concat([salt.subarray(0, 16), iv]);

      return { ciphertext, nonce };
    } catch (error) {
      console.error("Encryption failed:", error);
      throw new Error("Failed to encrypt TOTP secret");
    }
  }

  /**
   * Decrypts a TOTP secret using AES-256-GCM
   */
  async decryptSecret(ciphertext: Buffer, nonce: Buffer): Promise<string> {
    try {
      const masterKey = await this.getMasterKey();

      // Extract components from ciphertext
      const salt = ciphertext.subarray(0, this.saltLength);
      const iv = ciphertext.subarray(
        this.saltLength,
        this.saltLength + this.ivLength,
      );
      const tag = ciphertext.subarray(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength,
      );
      const encrypted = ciphertext.subarray(
        this.saltLength + this.ivLength + this.tagLength,
      );

      // Derive decryption key
      const key = this.deriveKey(masterKey, salt);

      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(salt);
      decipher.setAuthTag(tag);

      // Decrypt the data
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString("utf8");
    } catch (error) {
      console.error("Decryption failed:", error);
      throw new Error("Failed to decrypt TOTP secret");
    }
  }

  /**
   * Generates a cryptographically secure device hash
   */
  generateDeviceHash(
    userAgent: string,
    ipAddress: string,
    userId: string,
  ): string {
    const data = `${userId}:${userAgent}:${ipAddress}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generates secure recovery codes
   */
  generateRecoveryCodes(count: number = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      // Format as XXXX-XXXX for readability
      const formatted = `${code.substring(0, 4)}-${code.substring(4, 8)}`;
      codes.push(formatted);
    }

    return codes;
  }

  /**
   * Hashes a recovery code for secure storage
   */
  async hashRecoveryCode(code: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(code, salt, 100000, 32, "sha512");
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
  }

  /**
   * Verifies a recovery code against its hash
   */
  async verifyRecoveryCode(code: string, storedHash: string): Promise<boolean> {
    try {
      const [saltHex, hashHex] = storedHash.split(":");
      const salt = Buffer.from(saltHex, "hex");
      const storedHashBuffer = Buffer.from(hashHex, "hex");

      const hash = crypto.pbkdf2Sync(code, salt, 100000, 32, "sha512");

      return crypto.timingSafeEqual(hash, storedHashBuffer);
    } catch (error) {
      return false;
    }
  }
}

export const encryptionService = new EncryptionService();
