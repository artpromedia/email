import * as argon2 from "argon2";
import * as jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { loadEnv } from "../config/env";
import { prisma } from "../db/prisma";
import { redis, blacklistToken, isTokenBlacklisted } from "../db/redis";

const env = loadEnv();

export interface JWTPayload {
  sub: string; // User ID
  email: string;
  name: string;
  iat: number;
  exp: number;
  jti: string; // JWT ID for blacklisting
  amr: string[]; // Authentication Methods Reference: ["pwd"], ["pwd","otp"], ["pwd","passkey"]
  mfa_level: string; // "none" | "otp" | "passkey"
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  iat: number;
  exp: number;
  jti: string;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// JWT token management
export function generateAccessToken(
  user: {
    id: string;
    email: string;
    name: string;
  },
  options?: {
    amr?: string[];
    mfaLevel?: string;
  },
): string {
  const payload: Omit<JWTPayload, "iat" | "exp"> = {
    sub: user.id,
    email: user.email,
    name: user.name,
    jti: nanoid(),
    amr: options?.amr || ["pwd"],
    mfa_level: options?.mfaLevel || "none",
  };

  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "15m",
    issuer: "ceerion-mail",
    audience: "ceerion-mail-client",
  });
}

export function generateRefreshToken(
  userId: string,
  sessionId: string,
): string {
  const payload: Omit<RefreshTokenPayload, "iat" | "exp"> = {
    sub: userId,
    sessionId,
    jti: nanoid(),
  };

  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "7d",
    issuer: "ceerion-mail",
    audience: "ceerion-mail-refresh",
  });
}

export async function verifyAccessToken(
  token: string,
): Promise<JWTPayload | null> {
  try {
    const payload = jwt.verify(token, env.JWT_PRIVATE_KEY, {
      algorithms: ["RS256"],
      issuer: "ceerion-mail",
      audience: "ceerion-mail-client",
    }) as JWTPayload;

    // Check if token is blacklisted
    if (await isTokenBlacklisted(payload.jti)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload | null> {
  try {
    const payload = jwt.verify(token, env.JWT_PRIVATE_KEY, {
      algorithms: ["RS256"],
      issuer: "ceerion-mail",
      audience: "ceerion-mail-refresh",
    }) as RefreshTokenPayload;

    // Check if token is blacklisted
    if (await isTokenBlacklisted(payload.jti)) {
      return null;
    }

    // Verify session exists and is not revoked
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function blacklistAccessToken(token: string): Promise<void> {
  try {
    const payload = jwt.decode(token) as JWTPayload;
    if (payload?.jti && payload?.exp) {
      await blacklistToken(payload.jti, payload.exp);
    }
  } catch {
    // Token is invalid, nothing to blacklist
  }
}

export async function blacklistRefreshToken(token: string): Promise<void> {
  try {
    const payload = jwt.decode(token) as RefreshTokenPayload;
    if (payload?.jti && payload?.exp) {
      await blacklistToken(payload.jti, payload.exp);
    }
  } catch {
    // Token is invalid, nothing to blacklist
  }
}

// Session management
export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent?: string,
  deviceInfo?: string,
  mfaLevel: "NONE" | "OTP" | "PASSKEY" = "NONE",
  amr: string[] = ["pwd"],
) {
  const sessionId = nanoid();
  const refreshToken = generateRefreshToken(userId, sessionId);
  const refreshPayload = jwt.decode(refreshToken) as RefreshTokenPayload;

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: await argon2.hash(refreshToken), // Store hash for security
      deviceInfo,
      ipAddress,
      userAgent,
      expiresAt: new Date(refreshPayload.exp * 1000),
      mfaLevel,
      amr,
    },
  });

  return { session, refreshToken };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { isRevoked: true },
  });
}

export async function upgradeSessionMFA(
  sessionId: string,
  mfaLevel: "OTP" | "PASSKEY",
  amr: string[],
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { mfaLevel, amr },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
}

// MFA utilities
export function generateMFASecret(): string {
  return nanoid(32);
}

export function generateMFACode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function verifyMFACode(secret: string, code: string): boolean {
  // This is a simplified implementation
  // In production, use TOTP library like @otplib/preset-v11
  const timeWindow = Math.floor(Date.now() / 30000);
  const expectedCode = (
    ((timeWindow * parseInt(secret.substring(0, 8), 36)) % 900000) +
    100000
  ).toString();
  return expectedCode === code;
}

// Password reset tokens
export async function generatePasswordResetToken(
  email: string,
): Promise<string> {
  const token = nanoid(32);
  await redis.setex(`password_reset:${token}`, 3600, email); // 1 hour expiry
  return token;
}

export async function verifyPasswordResetToken(
  token: string,
): Promise<string | null> {
  const email = await redis.get(`password_reset:${token}`);
  if (email) {
    await redis.del(`password_reset:${token}`); // One-time use
  }
  return email;
}

// Audit logging
export async function logAuditEvent(
  action: string,
  resource: string,
  resourceId: string | null,
  ipAddress: string,
  userAgent: string | null,
  userId?: string,
  metadata?: any,
) {
  // Legacy function - consider migrating to new AuditLogger
  await prisma.auditEvent.create({
    data: {
      actorId: userId,
      action,
      resourceType: resource,
      resourceId,
      result: "SUCCESS",
      ip: ipAddress,
      userAgent,
      metadata,
    },
  });
}
