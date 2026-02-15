/**
 * Mail Folders API Route
 * Fetches and creates email folders from database
 */

import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxIds,
  getUserMailboxes,
  getUserDomains,
  getFolders,
  createFolder as createDbFolder,
  ensureUserMailbox,
  getEmailFromAuth,
} from "@/lib/mail/queries";
import { toFolderResponse } from "@/lib/mail/transform";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", folders: [] }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domainFilter = searchParams.get("domain") || undefined;

    // Auto-provision mailbox if user doesn't have one
    const email = getEmailFromAuth(authHeader);
    if (email) {
      await ensureUserMailbox(userId, email);
    }

    const mailboxIds = await getUserMailboxIds(
      userId,
      domainFilter && domainFilter !== "all" ? domainFilter : undefined
    );

    if (mailboxIds.length === 0) {
      return NextResponse.json({ folders: [] });
    }

    const [folders, mailboxes, domains] = await Promise.all([
      getFolders(mailboxIds),
      getUserMailboxes(userId),
      getUserDomains(userId),
    ]);

    const domainMap = new Map(domains.map((d) => [d.id, d]));
    const mailboxMap = new Map(mailboxes.map((m) => [m.id, m]));

    const responseFolders = folders.map((f) => {
      const mailbox = mailboxMap.get(f.mailboxId);
      const domain = mailbox?.domainId ? domainMap.get(mailbox.domainId) : undefined;
      return toFolderResponse(f, { mailbox, domain });
    });

    return NextResponse.json({ folders: responseFolders });
  } catch (error) {
    console.error("Error fetching folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders", folders: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      name: string;
      parentId?: string;
      mailboxId: string;
    };

    if (!body.name || !body.mailboxId) {
      return NextResponse.json(
        { error: "name and mailboxId are required" },
        { status: 400 }
      );
    }

    // Verify the mailbox belongs to the user
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(body.mailboxId)) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    const folder = await createDbFolder({
      mailboxId: body.mailboxId,
      name: body.name,
      fullPath: body.name,
      parentId: body.parentId,
    });

    return NextResponse.json(toFolderResponse(folder), { status: 201 });
  } catch (error) {
    console.error("Error creating folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
