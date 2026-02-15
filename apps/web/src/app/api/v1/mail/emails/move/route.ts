/**
 * Bulk move emails
 * POST /api/v1/mail/emails/move
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import { getUserMailboxIds, moveMessages, refreshAllFolderCounts } from "@/lib/mail/queries";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      emailIds: string[];
      destination: { folderId: string };
      action?: "move" | "copy";
    };

    if (!body.emailIds || body.emailIds.length === 0) {
      return NextResponse.json({ error: "No email IDs provided" }, { status: 400 });
    }
    if (!body.destination?.folderId) {
      return NextResponse.json({ error: "Destination folder required" }, { status: 400 });
    }

    const count = await moveMessages(body.emailIds, body.destination.folderId);
    const mailboxIds = await getUserMailboxIds(userId);
    await refreshAllFolderCounts(mailboxIds);

    return NextResponse.json({ success: true, moved: count });
  } catch (error) {
    console.error("Error moving emails:", error);
    return NextResponse.json({ error: "Failed to move emails" }, { status: 500 });
  }
}
