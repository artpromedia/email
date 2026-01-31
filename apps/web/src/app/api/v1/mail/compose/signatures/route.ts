import { type NextRequest, NextResponse } from "next/server";

/**
 * Extract user ID from JWT token in authorization header
 */
function extractUserIdFromToken(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;
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

// In-memory signature storage (in production, use database)
const signatureStore = new Map<
  string,
  Map<string, { id: string; name: string; content: string; isDefault: boolean; createdAt: string }>
>();

/**
 * Fetch user's signatures from storage
 */
function fetchUserSignatures(userId: string) {
  const userSignatures = signatureStore.get(userId);
  if (!userSignatures || userSignatures.size === 0) {
    // Return default signatures for demonstration
    return [
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
  }
  return Array.from(userSignatures.values());
}

/**
 * Save signature to storage
 */
function saveSignature(
  userId: string,
  signature: { id: string; name: string; content: string; isDefault: boolean; createdAt: string }
): void {
  if (!signatureStore.has(userId)) {
    signatureStore.set(userId, new Map());
  }
  const userSignatures = signatureStore.get(userId);

  // If this is the default, unset other defaults
  if (signature.isDefault && userSignatures) {
    for (const [id, sig] of userSignatures) {
      if (id !== signature.id && sig.isDefault) {
        userSignatures.set(id, { ...sig, isDefault: false });
      }
    }
  }

  userSignatures?.set(signature.id, signature);
  // In production: await db.insert(signatures).values(signature);
}

/**
 * GET /api/v1/mail/compose/signatures
 * Get user's email signatures
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

    // Fetch user's signatures from database
    const signatures = fetchUserSignatures(userId);

    return NextResponse.json({
      signatures,
      defaultSignatureId: signatures.find((s) => s.isDefault)?.id ?? null,
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

    const body = (await request.json()) as { name?: string; content?: string; isDefault?: boolean };
    const { name, content, isDefault } = body;

    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Save signature to database
    const newSignature = {
      id: Date.now().toString(),
      name,
      content,
      isDefault: Boolean(isDefault),
      createdAt: new Date().toISOString(),
    };

    saveSignature(userId, newSignature);

    return NextResponse.json(newSignature, { status: 201 });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json({ error: "Failed to create signature" }, { status: 500 });
  }
}
