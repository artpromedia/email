import { type NextRequest, NextResponse } from "next/server";

const AUTH_API_URL = process.env["AUTH_API_URL"] || "http://auth:8080";

/**
 * Extract user ID from JWT token in authorization header
 */
function extractUserIdFromToken(authHeader: string): string | null {
  try {
    // Remove 'Bearer ' prefix if present
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;

    // Decode JWT payload (middle part)
    // In production, use proper JWT verification with secret
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64").toString()) as {
      sub?: string;
      userId?: string;
    };
    return payload.sub ?? payload.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/mail/compose/addresses
 * Get available sender addresses for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch user's email addresses from auth service
    const response = await fetch(`${AUTH_API_URL}/api/v1/users/${userId}/addresses`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        addresses?: unknown[];
        defaultAddressId?: string | null;
      };
      return NextResponse.json({
        addresses: data.addresses ?? [],
        defaultAddressId: data.defaultAddressId ?? null,
      });
    }

    // Return empty addresses if service unavailable
    return NextResponse.json({
      addresses: [],
      defaultAddressId: null,
    });
  } catch (error) {
    console.error("Error fetching sender addresses:", error);
    return NextResponse.json({ error: "Failed to fetch sender addresses" }, { status: 500 });
  }
}
