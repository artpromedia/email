/**
 * Bulk mark as unread
 * POST /api/v1/mail/emails/unread
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import { getUserMailboxIds, updateMessageFlags, refreshAllFolderCounts } from "@/lib/mail/queries";

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

    const count = await updateMessageFlags(body.emailIds, [], ["\\Seen"]);
    const mailboxIds = await getUserMailboxIds(userId);
    await refreshAllFolderCounts(mailboxIds);

    return NextResponse.json({ success: true, updated: count });
  } catch (error) {
    console.error("Error marking emails as unread:", error);
    return NextResponse.json({ error: "Failed to mark as unread" }, { status: 500 });
  }
}
