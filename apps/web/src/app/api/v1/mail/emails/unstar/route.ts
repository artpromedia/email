/**
 * Bulk unstar emails
 * POST /api/v1/mail/emails/unstar
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import { updateMessageFlags } from "@/lib/mail/queries";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { emailIds: string[] };
    if (!body.emailIds || body.emailIds.length === 0) {
      return NextResponse.json({ error: "No email IDs provided" }, { status: 400 });
    }

    const count = await updateMessageFlags(body.emailIds, [], ["\\Flagged"]);
    return NextResponse.json({ success: true, updated: count });
  } catch (error) {
    console.error("Error unstarring emails:", error);
    return NextResponse.json({ error: "Failed to unstar emails" }, { status: 500 });
  }
}
