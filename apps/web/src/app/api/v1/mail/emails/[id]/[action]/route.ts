/**
 * Email Actions API Route
 * Mark as read/unread, star, move, archive
 */

import { NextResponse } from "next/server";

const IMAP_API_URL = process.env.IMAP_API_URL || "http://imap-server:8084";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const { id, action } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const authHeader = request.headers.get("Authorization");

    // Validate action
    const validActions = [
      "read",
      "unread",
      "star",
      "unstar",
      "archive",
      "unarchive",
      "move",
      "spam",
      "notspam",
    ];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    // Perform action via IMAP server
    const response = await fetch(`${IMAP_API_URL}/api/v1/emails/${id}/${action}`, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data: unknown = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Failed to perform action" }, { status: response.status });
  } catch (error) {
    console.error("Error performing email action:", error);
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
