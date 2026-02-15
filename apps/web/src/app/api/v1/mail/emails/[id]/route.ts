/**
 * Single Email API Route
 * Get, update, or delete a specific email
 */

import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxIds,
  getUserDomains,
  getMessage,
  getFolders,
  updateMessageFlags,
  trashMessages,
} from "@/lib/mail/queries";
import { toEmailResponse } from "@/lib/mail/transform";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const msg = await getMessage(id);
    if (!msg) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Verify ownership
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(msg.mailboxId)) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Get context
    const [domains, folders] = await Promise.all([getUserDomains(userId), getFolders(mailboxIds)]);
    const domainMap = new Map(domains.map((d) => [d.id, d]));
    const folder = folders.find((f) => f.id === msg.folderId);

    const email = toEmailResponse(msg, {
      folder,
      domain: folder?.mailboxId
        ? domainMap.get(folders.find((f) => f.mailboxId === folder.mailboxId)?.mailboxId ?? "")
        : undefined,
    });

    // Auto-mark as read
    const flags = Array.isArray(msg.flags) ? msg.flags : [];
    if (!flags.includes("\\Seen")) {
      await updateMessageFlags([id], ["\\Seen"], []);
    }

    return NextResponse.json(email);
  } catch (error) {
    console.error("Error fetching email:", error);
    return NextResponse.json({ error: "Failed to fetch email" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      isRead?: boolean;
      isStarred?: boolean;
      folder?: string;
    };

    // Verify ownership
    const msg = await getMessage(id);
    if (!msg) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(msg.mailboxId)) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const addFlags: string[] = [];
    const removeFlags: string[] = [];

    if (body.isRead === true) addFlags.push("\\Seen");
    if (body.isRead === false) removeFlags.push("\\Seen");
    if (body.isStarred === true) addFlags.push("\\Flagged");
    if (body.isStarred === false) removeFlags.push("\\Flagged");

    if (addFlags.length > 0 || removeFlags.length > 0) {
      await updateMessageFlags([id], addFlags, removeFlags);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating email:", error);
    return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mailboxIds = await getUserMailboxIds(userId);
    const result = await trashMessages([id], mailboxIds);

    return NextResponse.json({
      success: true,
      message: result.deleted > 0 ? "Email permanently deleted" : "Email moved to trash",
    });
  } catch (error) {
    console.error("Error deleting email:", error);
    return NextResponse.json({ error: "Failed to delete email" }, { status: 500 });
  }
}
