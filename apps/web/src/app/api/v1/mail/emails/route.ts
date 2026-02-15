/**
 * Mail Emails API Route
 * Lists emails from the database with pagination, filtering, and search
 */

import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxIds,
  getUserDomains,
  listMessages,
  getFolders,
  trashMessages,
} from "@/lib/mail/queries";
import { toEmailResponse } from "@/lib/mail/transform";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", emails: [], total: 0 }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "inbox";
    const folderId = searchParams.get("folderId") || undefined;
    const domain = searchParams.get("domain") || "all";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(
      searchParams.get("pageSize") || searchParams.get("limit") || "50",
      10
    );
    const search = searchParams.get("search") || undefined;
    const starred = searchParams.get("starred") === "true" ? true : undefined;
    const read = searchParams.has("read") ? searchParams.get("read") === "true" : undefined;
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const mailboxIds = await getUserMailboxIds(userId, domain !== "all" ? domain : undefined);

    if (mailboxIds.length === 0) {
      return NextResponse.json({
        emails: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      });
    }

    // Get domains and folders for context
    const [domains, folders] = await Promise.all([getUserDomains(userId), getFolders(mailboxIds)]);

    const domainMap = new Map(domains.map((d) => [d.id, d]));
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    const { messages, total } = await listMessages({
      mailboxIds,
      folder,
      folderId,
      page,
      pageSize,
      search,
      starred,
      read,
      sortBy,
      sortOrder,
    });

    const emails = messages.map((msg) => {
      const msgFolder = folderMap.get(msg.folderId);
      // Find the mailbox to determine domain
      const mailboxDomainId = msgFolder?.mailboxId
        ? folders.find((f) => f.mailboxId === msgFolder.mailboxId)?.mailboxId
        : undefined;
      // Get domain from folder's mailbox
      const msgDomain = mailboxDomainId ? domainMap.get(mailboxDomainId) : undefined;

      return toEmailResponse(msg, {
        folder: msgFolder,
        domain: msgDomain,
        showDomainBadge: domain === "all" && domains.length > 1,
      });
    });

    return NextResponse.json({
      emails,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails", emails: [], total: 0 },
      { status: 500 }
    );
  }
}

/** DELETE /api/v1/mail/emails — bulk delete (move to trash) */
export async function DELETE(request: Request) {
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

    const mailboxIds = await getUserMailboxIds(userId);
    const result = await trashMessages(body.emailIds, mailboxIds);

    return NextResponse.json({
      success: true,
      moved: result.moved,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error("Error deleting emails:", error);
    return NextResponse.json({ error: "Failed to delete emails" }, { status: 500 });
  }
}
