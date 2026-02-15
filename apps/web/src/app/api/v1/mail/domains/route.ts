/**
 * Mail Domains API Route
 * Fetches user's email domains with associated mailboxes
 */

import { NextResponse } from "next/server";
import { getUserIdFromAuth, getEmailFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxes,
  getUserDomains,
  getFolders,
  ensureUserMailbox,
  specialUseToFolderType,
} from "@/lib/mail/queries";

const DOMAIN_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#f43f5e",
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", domains: [] }, { status: 401 });
    }

    // Auto-provision mailbox if needed
    const email = getEmailFromAuth(authHeader);
    if (email) {
      await ensureUserMailbox(userId, email);
    }

    const [mailboxes, domains, allFolders] = await Promise.all([
      getUserMailboxes(userId),
      getUserDomains(userId),
      getUserMailboxes(userId).then((mbs) => getFolders(mbs.map((m) => m.id))),
    ]);

    // Group mailboxes and folders by domain
    const result = domains.map((domain, idx) => {
      const domainMailboxes = mailboxes.filter((m) => m.domainId === domain.id);

      let unreadCount = 0;
      let totalCount = 0;

      const formattedMailboxes = domainMailboxes.map((mb) => {
        const mbFolders = allFolders.filter((f) => f.mailboxId === mb.id);
        const inboxFolder = mbFolders.find((f) => f.specialUse === "\\Inbox");
        unreadCount += inboxFolder?.unseenCount ?? 0;
        totalCount += inboxFolder?.messageCount ?? 0;

        return {
          id: mb.id,
          domainId: domain.id,
          userId: mb.userId,
          email: mb.email,
          displayName: mb.displayName ?? mb.email,
          type: "personal" as const,
          isDefault: true,
          unreadCount: inboxFolder?.unseenCount ?? 0,
          folders: mbFolders.map((f) => ({
            id: f.id,
            mailboxId: f.mailboxId,
            name: f.name,
            type: specialUseToFolderType(f.specialUse),
            unreadCount: f.unseenCount,
            totalCount: f.messageCount,
            isSystem: f.specialUse !== null,
            sortOrder: f.sortOrder,
          })),
        };
      });

      return {
        id: domain.id,
        domain: domain.name,
        displayName: domain.displayName ?? domain.name,
        color: DOMAIN_COLORS[idx % DOMAIN_COLORS.length],
        isPrimary: domain.isPrimary,
        isVerified: true,
        unreadCount,
        totalCount,
        mailboxes: formattedMailboxes,
        sharedMailboxes: [],
      };
    });

    return NextResponse.json({ domains: result });
  } catch (error) {
    console.error("Error fetching mail domains:", error);
    return NextResponse.json({ error: "Failed to fetch domains", domains: [] }, { status: 500 });
  }
}
