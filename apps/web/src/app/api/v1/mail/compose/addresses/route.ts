import { type NextRequest, NextResponse } from "next/server";

/**
 * JWT claims produced by the Go auth service.
 */
interface JwtClaims {
  sub: string; // userId (UUID)
  email: string;
  name: string; // displayName
  org_id: string;
  primary_domain_id: string;
  domains: string[]; // domain UUIDs
  role: string;
}

/**
 * Decode JWT payload without signature verification.
 * In production, verify with the shared secret.
 */
function decodeJwt(authHeader: string): JwtClaims | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64").toString()) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/mail/compose/addresses
 * Build sendable addresses from the JWT claims.
 */
export function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const claims = decodeJwt(authHeader);
    if (!claims?.sub || !claims.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const domain = claims.email.split("@")[1] ?? "";
    const displayName = claims.name || claims.email.split("@")[0] || "";
    const domainId = claims.primary_domain_id || claims.org_id || domain;

    // Build the user's primary sendable address from the JWT
    const primaryAddress = {
      id: claims.sub,
      email: claims.email,
      displayName,
      formatted: displayName ? `${displayName} <${claims.email}>` : claims.email,
      domainId,
      domainName: domain,
      domainColor: "#3b82f6",
      type: "personal" as const,
      isPrimary: true,
      sendAs: "send-as" as const,
      isVerified: true,
      dailyLimit: 500,
      sentToday: 0,
    };

    return NextResponse.json({
      addresses: [primaryAddress],
      primaryAddressId: claims.sub,
    });
  } catch (error) {
    console.error("Error fetching sender addresses:", error);
    return NextResponse.json({ error: "Failed to fetch sender addresses" }, { status: 500 });
  }
}
