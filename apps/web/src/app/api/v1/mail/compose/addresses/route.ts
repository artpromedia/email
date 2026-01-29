import { type NextRequest, NextResponse } from "next/server";

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

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Fetch user's email addresses from database
    const addresses = [
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

    return NextResponse.json({
      addresses,
      defaultAddressId: addresses.find((a) => a.isDefault)?.id,
    });
  } catch (error) {
    console.error("Error fetching sender addresses:", error);
    return NextResponse.json({ error: "Failed to fetch sender addresses" }, { status: 500 });
  }
}
