import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/mail/compose/signatures
 * Get user's email signatures
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Fetch user's signatures from database
    const signatures = [
      {
        id: "1",
        name: "Default",
        content: "Best regards,\nJohn Doe",
        isDefault: true,
      },
      {
        id: "2",
        name: "Professional",
        content:
          "Best regards,\n\nJohn Doe\nSenior Software Engineer\nAcme Corporation\njohn.doe@example.com\n+1 (555) 123-4567",
        isDefault: false,
      },
      {
        id: "3",
        name: "Brief",
        content: "Cheers,\nJohn",
        isDefault: false,
      },
    ];

    return NextResponse.json({
      signatures,
      defaultSignatureId: signatures.find((s) => s.isDefault)?.id,
    });
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return NextResponse.json({ error: "Failed to fetch signatures" }, { status: 500 });
  }
}

/**
 * POST /api/v1/mail/compose/signatures
 * Create a new signature
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, content, isDefault } = body;

    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    // TODO: Save signature to database
    const newSignature = {
      id: Date.now().toString(),
      name,
      content,
      isDefault: Boolean(isDefault),
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(newSignature, { status: 201 });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json({ error: "Failed to create signature" }, { status: 500 });
  }
}
