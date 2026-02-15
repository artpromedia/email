/**
 * Email Actions API Route
 * Mark as read/unread, star/unstar, move, archive, spam
 */

import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxIds,
  getMessage,
  updateMessageFlags,
  moveMessages,
  getFolderBySpecialUse,
} from "@/lib/mail/queries";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const { id, action } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

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

    // Verify ownership
    const msg = await getMessage(id);
    if (!msg) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(msg.mailboxId)) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    switch (action) {
      case "read":
        await updateMessageFlags([id], ["\\Seen"], []);
        break;
      case "unread":
        await updateMessageFlags([id], [], ["\\Seen"]);
        break;
      case "star":
        await updateMessageFlags([id], ["\\Flagged"], []);
        break;
      case "unstar":
        await updateMessageFlags([id], [], ["\\Flagged"]);
        break;
      case "archive": {
        const archiveFolder = await getFolderBySpecialUse(msg.mailboxId, "\\Archive");
        if (archiveFolder) {
          await moveMessages([id], archiveFolder.id);
        }
        break;
      }
      case "unarchive": {
        const inboxFolder = await getFolderBySpecialUse(msg.mailboxId, "\\Inbox");
        if (inboxFolder) {
          await moveMessages([id], inboxFolder.id);
        }
        break;
      }
      case "move": {
        const folderId = body.folderId as string;
        if (!folderId) {
          return NextResponse.json({ error: "folderId required" }, { status: 400 });
        }
        await moveMessages([id], folderId);
        break;
      }
      case "spam": {
        const spamFolder = await getFolderBySpecialUse(msg.mailboxId, "\\Junk");
        if (spamFolder) {
          await moveMessages([id], spamFolder.id);
        }
        break;
      }
      case "notspam": {
        const inbox = await getFolderBySpecialUse(msg.mailboxId, "\\Inbox");
        if (inbox) {
          await moveMessages([id], inbox.id);
        }
        break;
      }
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("Error performing email action:", error);
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
