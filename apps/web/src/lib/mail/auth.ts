/**
 * JWT authentication helpers for mail API routes
 */

/**
 * Decode JWT claims from authorization header (no verification — auth-service handles that)
 */
export function decodeJwtClaims(authHeader: string): {
  sub?: string;
  userId?: string;
  email?: string;
  name?: string;
} | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64").toString()) as {
      sub?: string;
      userId?: string;
      email?: string;
      name?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Extract user ID from authorization header
 */
export function getUserIdFromAuth(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const claims = decodeJwtClaims(authHeader);
  return claims?.sub ?? claims?.userId ?? null;
}

/**
 * Extract email from authorization header
 */
export function getEmailFromAuth(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const claims = decodeJwtClaims(authHeader);
  return claims?.email ?? null;
}

/**
 * Extract name from authorization header
 */
export function getNameFromAuth(authHeader: string | null): string {
  if (!authHeader) return "";
  const claims = decodeJwtClaims(authHeader);
  return claims?.name ?? "";
}
