/**
 * Unread Counts API Route
 * GET /api/v1/mail/unread-counts
 * Returns unread email counts grouped by domain, mailbox, and folder
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth, getEmailFromAuth } from "@/lib/mail/auth";
import { getUserMailboxIds, getUnreadCounts, ensureUserMailbox } from "@/lib/mail/queries";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Auto-provision mailbox if needed
    const email = getEmailFromAuth(authHeader);
    if (email) {
      await ensureUserMailbox(userId, email);
    }

    const mailboxIds = await getUserMailboxIds(userId);
    const counts = await getUnreadCounts(mailboxIds);

    return NextResponse.json(counts);
  } catch (error) {
    console.error("Error fetching unread counts:", error);
    return NextResponse.json(
      { total: 0, byDomain: {}, byMailbox: {}, byFolder: {} },
      { status: 500 }
    );
  }
}
