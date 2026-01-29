import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/mail/compose/drafts
 * Get all draft emails for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") || "0", 10);

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Fetch drafts from database
    const drafts = [
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

    const body = await request.json();
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

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Save draft to database
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

    console.log("Draft created:", { id: draft.id, subject: draft.subject });

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

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Draft ID is required" }, { status: 400 });
    }

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Update draft in database
    const updatedDraft = {
      id,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    console.log("Draft updated:", { id, subject: updates.subject });

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
export async function DELETE(request: NextRequest) {
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

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Delete draft from database
    console.log("Draft deleted:", { id });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Error deleting draft:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
