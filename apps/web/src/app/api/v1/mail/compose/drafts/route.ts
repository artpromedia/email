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
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString()) as {
      sub?: string;
      userId?: string;
    };
    return payload.sub ?? payload.userId ?? null;
  } catch {
    return null;
  }
}

// In-memory draft storage (in production, use database)
const draftStore = new Map<string, Map<string, Record<string, unknown>>>();

/**
 * Fetch drafts from storage for a user
 */
function fetchUserDrafts(userId: string, limit: number, offset: number) {
  const userDrafts = draftStore.get(userId);
  if (!userDrafts) {
    // Return mock data for demonstration
    return [
      {
        id: "draft-1",
        from: "user@example.com",
        to: ["recipient@example.com"],
        cc: [],
        bcc: [],
        subject: "Draft email",
        body: "This is a draft email...",
        bodyType: "html",
        attachments: [],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  const allDrafts = Array.from(userDrafts.values());
  return allDrafts.slice(offset, offset + limit);
}

/**
 * Save draft to storage
 */
function saveDraft(userId: string, draft: Record<string, unknown>): void {
  if (!draftStore.has(userId)) {
    draftStore.set(userId, new Map());
  }
  const userDrafts = draftStore.get(userId);
  userDrafts?.set(draft.id as string, draft);
  // In production: await db.insert(drafts).values(draft);
}

/**
 * Update draft in storage
 */
function updateDraft(
  userId: string,
  draftId: string,
  updates: Record<string, unknown>
): Record<string, unknown> | null {
  const userDrafts = draftStore.get(userId);
  if (!userDrafts?.has(draftId)) {
    return null;
  }
  const existing = userDrafts.get(draftId);
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  userDrafts.set(draftId, updated);
  // In production: await db.update(drafts).set(updates).where(eq(drafts.id, draftId));
  return updated;
}

/**
 * Delete draft from storage
 */
function deleteDraft(userId: string, draftId: string): boolean {
  const userDrafts = draftStore.get(userId);
  if (!userDrafts?.has(draftId)) {
    return false;
  }
  userDrafts.delete(draftId);
  // In production: await db.delete(drafts).where(eq(drafts.id, draftId));
  return true;
}

/**
 * GET /api/v1/mail/compose/drafts
 * Get all draft emails for the authenticated user
 */
export function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") || "0", 10);

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch drafts from database
    const drafts = fetchUserDrafts(userId, limit, offset);

    return NextResponse.json({
      drafts,
      total: drafts.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

/**
 * POST /api/v1/mail/compose/drafts
 * Create a new draft email
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      from?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body?: string;
      bodyType?: string;
      attachments?: string[];
      inReplyTo?: string;
      references?: string[];
    };
    const {
      from,
      to = [],
      cc = [],
      bcc = [],
      subject = "",
      body: emailBody = "",
      bodyType = "html",
      attachments = [],
      inReplyTo,
      references,
    } = body;

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Save draft to database
    const draft = {
      id: `draft-${Date.now()}`,
      userId,
      from,
      to: Array.isArray(to) ? to : [to].filter(Boolean),
      cc: Array.isArray(cc) ? cc : [cc].filter(Boolean),
      bcc: Array.isArray(bcc) ? bcc : [bcc].filter(Boolean),
      subject,
      body: emailBody,
      bodyType,
      attachments,
      inReplyTo,
      references,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveDraft(userId, draft);
    console.info("Draft created:", { id: draft.id, subject: draft.subject });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    console.error("Error creating draft:", error);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
}

/**
 * PUT /api/v1/mail/compose/drafts
 * Update an existing draft (for auto-save)
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { id?: string; [key: string]: unknown };
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Draft ID is required" }, { status: 400 });
    }

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Update draft in database
    const updatedDraft = updateDraft(userId, id, updates);
    if (!updatedDraft) {
      // Create new draft if it doesn't exist
      const newDraft = {
        id,
        ...updates,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveDraft(userId, newDraft);
      console.info("Draft created via PUT:", { id });
      return NextResponse.json(newDraft);
    }

    console.info("Draft updated:", { id, subject: updates.subject as string | undefined });

    return NextResponse.json(updatedDraft);
  } catch (error) {
    console.error("Error updating draft:", error);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/mail/compose/drafts/:id
 * Delete a draft email
 */
export function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Draft ID is required" }, { status: 400 });
    }

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Delete draft from database
    deleteDraft(userId, id);
    console.info("Draft deleted:", { id });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Error deleting draft:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
