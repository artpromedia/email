import { type NextRequest, NextResponse } from "next/server";

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

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString()) as {
      sub?: string;
      userId?: string;
    };
    return payload.sub ?? payload.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch user's email addresses from database
 * In production, this queries the database for verified sender addresses
 */
function fetchUserAddresses(_userId: string) {
  // Mock data - in production, query database:
  // const addresses = await db.select().from(userAddresses).where(eq(userAddresses.userId, userId));
  return [
    {
      id: "1",
      email: "user@example.com",
      displayName: "John Doe",
      isDefault: true,
      isVerified: true,
      signature: "Best regards,\nJohn Doe",
    },
    {
      id: "2",
      email: "john.doe@company.com",
      displayName: "John Doe - Work",
      isDefault: false,
      isVerified: true,
      signature: "Regards,\nJohn Doe\nSenior Engineer",
    },
  ];
}

/**
 * GET /api/v1/mail/compose/addresses
 * Get available sender addresses for the authenticated user
 */
export function GET(request: NextRequest) {
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

    // Fetch user's email addresses from database
    const addresses = fetchUserAddresses(userId);

    return NextResponse.json({
      addresses,
      defaultAddressId: addresses.find((a) => a.isDefault)?.id ?? null,
    });
  } catch (error) {
    console.error("Error fetching sender addresses:", error);
    return NextResponse.json({ error: "Failed to fetch sender addresses" }, { status: 500 });
  }
}
