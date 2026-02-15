import { type NextRequest, NextResponse } from "next/server";

/**
 * JWT claims from the Go auth service.
 */
interface JwtClaims {
  sub: string;
  email: string;
  name: string;
}

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

// In-memory signature storage (in production, use database)
const signatureStore = new Map<
  string,
  Map<
    string,
    {
      id: string;
      name: string;
      content: string;
      contentHtml: string;
      level: "address" | "domain" | "global";
      isDefault: boolean;
      createdAt: string;
    }
  >
>();

/**
 * Build default signatures from JWT claims.
 */
function buildDefaultSignatures(claims: JwtClaims) {
  const displayName = claims.name || claims.email.split("@")[0] || "User";
  return [
    {
      id: `sig-default-${claims.sub}`,
      name: "Default",
      content: `Best regards,\n${displayName}`,
      contentHtml: `<p>Best regards,<br/>${displayName}</p>`,
      level: "global" as const,
      isDefault: true,
    },
    {
      id: `sig-pro-${claims.sub}`,
      name: "Professional",
      content: `Best regards,\n\n${displayName}\n${claims.email}`,
      contentHtml: `<p>Best regards,</p><p>${displayName}<br/>${claims.email}</p>`,
      level: "global" as const,
      isDefault: false,
    },
    {
      id: `sig-brief-${claims.sub}`,
      name: "Brief",
      content: `Cheers,\n${displayName.split(" ")[0]}`,
      contentHtml: `<p>Cheers,<br/>${displayName.split(" ")[0]}</p>`,
      level: "global" as const,
      isDefault: false,
    },
  ];
}

/**
 * Fetch user's signatures from storage
 */
function fetchUserSignatures(userId: string, claims: JwtClaims) {
  const userSignatures = signatureStore.get(userId);
  if (!userSignatures || userSignatures.size === 0) {
    return buildDefaultSignatures(claims);
  }
  return Array.from(userSignatures.values());
}

/**
 * Save signature to storage
 */
function saveSignature(
  userId: string,
  signature: {
    id: string;
    name: string;
    content: string;
    contentHtml: string;
    level: "address" | "domain" | "global";
    isDefault: boolean;
    createdAt: string;
  }
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

    const claims = decodeJwt(authHeader);
    if (!claims?.sub) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const signatures = fetchUserSignatures(claims.sub, claims);

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

    const claims = decodeJwt(authHeader);
    if (!claims?.sub) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const contentHtml = content
      .split("\n")
      .map((line) => (line ? `${line}<br/>` : "<br/>"))
      .join("");

    const newSignature = {
      id: Date.now().toString(),
      name,
      content,
      contentHtml: `<p>${contentHtml}</p>`,
      level: "global" as const,
      isDefault: Boolean(isDefault),
      createdAt: new Date().toISOString(),
    };

    saveSignature(claims.sub, newSignature);

    return NextResponse.json(newSignature, { status: 201 });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json({ error: "Failed to create signature" }, { status: 500 });
  }
}
