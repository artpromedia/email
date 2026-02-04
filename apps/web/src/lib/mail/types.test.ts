/**
 * Mail Types Tests
 * Tests for mail type definitions and constants
 */

import {
  DOMAIN_COLORS,
  SYSTEM_FOLDERS,
  type Domain,
  type Mailbox,
  type SharedMailbox,
  type MailFolder,
  type EmailListItem,
  type EmailListQuery,
  type ViewPreferences,
  type MoveDestination,
  type MoveEmailRequest,
  type MailSubscription,
  type MailEvent,
  type UnreadCountUpdate,
  type SendableAddress,
  type EmailSignature,
  type EmailBranding,
} from "./types";

describe("Mail Types", () => {
  describe("DOMAIN_COLORS", () => {
    it("should have exactly 8 colors", () => {
      expect(DOMAIN_COLORS).toHaveLength(8);
    });

    it("should have blue color", () => {
      const blue = DOMAIN_COLORS.find((c) => c.name === "blue");
      expect(blue).toBeDefined();
      expect(blue?.value).toBe("#3b82f6");
      expect(blue?.bg).toBe("bg-blue-500");
      expect(blue?.text).toBe("text-blue-500");
      expect(blue?.light).toBe("bg-blue-100");
    });

    it("should have purple color", () => {
      const purple = DOMAIN_COLORS.find((c) => c.name === "purple");
      expect(purple).toBeDefined();
      expect(purple?.value).toBe("#8b5cf6");
    });

    it("should have green color", () => {
      const green = DOMAIN_COLORS.find((c) => c.name === "green");
      expect(green).toBeDefined();
      expect(green?.value).toBe("#22c55e");
    });

    it("should have orange color", () => {
      const orange = DOMAIN_COLORS.find((c) => c.name === "orange");
      expect(orange).toBeDefined();
      expect(orange?.value).toBe("#f97316");
    });

    it("should have pink color", () => {
      const pink = DOMAIN_COLORS.find((c) => c.name === "pink");
      expect(pink).toBeDefined();
      expect(pink?.value).toBe("#ec4899");
    });

    it("should have teal color", () => {
      const teal = DOMAIN_COLORS.find((c) => c.name === "teal");
      expect(teal).toBeDefined();
      expect(teal?.value).toBe("#14b8a6");
    });

    it("should have indigo color", () => {
      const indigo = DOMAIN_COLORS.find((c) => c.name === "indigo");
      expect(indigo).toBeDefined();
      expect(indigo?.value).toBe("#6366f1");
    });

    it("should have rose color", () => {
      const rose = DOMAIN_COLORS.find((c) => c.name === "rose");
      expect(rose).toBeDefined();
      expect(rose?.value).toBe("#f43f5e");
    });

    it("all colors should have required properties", () => {
      DOMAIN_COLORS.forEach((color) => {
        expect(color).toHaveProperty("name");
        expect(color).toHaveProperty("value");
        expect(color).toHaveProperty("bg");
        expect(color).toHaveProperty("text");
        expect(color).toHaveProperty("light");
        expect(typeof color.name).toBe("string");
        expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
        expect(color.bg).toMatch(/^bg-\w+-\d+$/);
        expect(color.text).toMatch(/^text-\w+-\d+$/);
        expect(color.light).toMatch(/^bg-\w+-\d+$/);
      });
    });
  });

  describe("SYSTEM_FOLDERS", () => {
    it("should have inbox folder", () => {
      expect(SYSTEM_FOLDERS.inbox).toBeDefined();
      expect(SYSTEM_FOLDERS.inbox.icon).toBe("inbox");
      expect(SYSTEM_FOLDERS.inbox.label).toBe("Inbox");
    });

    it("should have sent folder", () => {
      expect(SYSTEM_FOLDERS.sent).toBeDefined();
      expect(SYSTEM_FOLDERS.sent.icon).toBe("send");
      expect(SYSTEM_FOLDERS.sent.label).toBe("Sent");
    });

    it("should have drafts folder", () => {
      expect(SYSTEM_FOLDERS.drafts).toBeDefined();
      expect(SYSTEM_FOLDERS.drafts.icon).toBe("file-edit");
      expect(SYSTEM_FOLDERS.drafts.label).toBe("Drafts");
    });

    it("should have trash folder", () => {
      expect(SYSTEM_FOLDERS.trash).toBeDefined();
      expect(SYSTEM_FOLDERS.trash.icon).toBe("trash-2");
      expect(SYSTEM_FOLDERS.trash.label).toBe("Trash");
    });

    it("should have spam folder", () => {
      expect(SYSTEM_FOLDERS.spam).toBeDefined();
      expect(SYSTEM_FOLDERS.spam.icon).toBe("alert-triangle");
      expect(SYSTEM_FOLDERS.spam.label).toBe("Spam");
    });

    it("should have archive folder", () => {
      expect(SYSTEM_FOLDERS.archive).toBeDefined();
      expect(SYSTEM_FOLDERS.archive.icon).toBe("archive");
      expect(SYSTEM_FOLDERS.archive.label).toBe("Archive");
    });

    it("should have starred folder", () => {
      expect(SYSTEM_FOLDERS.starred).toBeDefined();
      expect(SYSTEM_FOLDERS.starred.icon).toBe("star");
      expect(SYSTEM_FOLDERS.starred.label).toBe("Starred");
    });

    it("all folders should have icon and label properties", () => {
      Object.entries(SYSTEM_FOLDERS).forEach(([key, folder]) => {
        expect(folder).toHaveProperty("icon");
        expect(folder).toHaveProperty("label");
        expect(typeof folder.icon).toBe("string");
        expect(typeof folder.label).toBe("string");
      });
    });
  });

  describe("Type exports", () => {
    it("Domain type should be usable", () => {
      const domain: Domain = {
        id: "1",
        domain: "example.com",
        displayName: "Example",
        color: "#3b82f6",
        isPrimary: true,
        isVerified: true,
        unreadCount: 5,
        totalCount: 100,
        mailboxes: [],
        sharedMailboxes: [],
      };
      expect(domain.id).toBe("1");
      expect(domain.domain).toBe("example.com");
    });

    it("Mailbox type should be usable", () => {
      const mailbox: Mailbox = {
        id: "mb1",
        domainId: "d1",
        userId: "u1",
        email: "user@example.com",
        displayName: "User",
        type: "personal",
        isDefault: true,
        unreadCount: 0,
        folders: [],
      };
      expect(mailbox.id).toBe("mb1");
      expect(mailbox.type).toBe("personal");
    });

    it("MailFolder type should be usable", () => {
      const folder: MailFolder = {
        id: "f1",
        mailboxId: "mb1",
        name: "Custom",
        type: "custom",
        unreadCount: 0,
        totalCount: 10,
        isSystem: false,
        sortOrder: 0,
      };
      expect(folder.id).toBe("f1");
      expect(folder.type).toBe("custom");
    });

    it("EmailListItem type should be usable", () => {
      const item: EmailListItem = {
        id: "e1",
        from: { email: "sender@example.com", name: "Sender" },
        to: [{ email: "recipient@example.com", name: "Recipient" }],
        subject: "Test",
        body: "Test body",
        date: new Date().toISOString(),
        isRead: false,
        isStarred: false,
        folder: "inbox",
        hasAttachments: false,
        domainId: "d1",
        domainName: "example.com",
        domainColor: "#3b82f6",
        showDomainBadge: true,
        snippet: "Test snippet...",
        hasReplied: false,
        hasForwarded: false,
      };
      expect(item.id).toBe("e1");
      expect(item.domainId).toBe("d1");
    });

    it("EmailListQuery type should be usable", () => {
      const query: EmailListQuery = {
        domain: "all",
        folder: "inbox",
        page: 1,
        pageSize: 20,
        sortBy: "date",
        sortOrder: "desc",
      };
      expect(query.domain).toBe("all");
      expect(query.folder).toBe("inbox");
    });

    it("ViewPreferences type should be usable", () => {
      const prefs: ViewPreferences = {
        mode: "unified",
        activeDomain: "all",
        showUnreadOnly: false,
        previewPane: "right",
        density: "comfortable",
        groupByConversation: true,
      };
      expect(prefs.mode).toBe("unified");
      expect(prefs.density).toBe("comfortable");
    });

    it("MoveDestination type should be usable", () => {
      const dest: MoveDestination = {
        folder: "archive",
      };
      expect(dest.folder).toBe("archive");
    });

    it("MoveEmailRequest type should be usable", () => {
      const req: MoveEmailRequest = {
        emailIds: ["e1", "e2"],
        destination: { folder: "archive" },
      };
      expect(req.emailIds).toHaveLength(2);
    });

    it("MailSubscription type should be usable", () => {
      const sub: MailSubscription = {
        id: "sub1",
        userId: "u1",
        mailboxId: "mb1",
        eventTypes: ["new", "update", "delete"],
      };
      expect(sub.id).toBe("sub1");
    });

    it("MailEvent type should be usable", () => {
      const event: MailEvent = {
        type: "new",
        emailId: "e1",
        mailboxId: "mb1",
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe("new");
    });

    it("UnreadCountUpdate type should be usable", () => {
      const update: UnreadCountUpdate = {
        mailboxId: "mb1",
        folderId: "f1",
        count: 5,
      };
      expect(update.count).toBe(5);
    });

    it("SendableAddress type should be usable", () => {
      const addr: SendableAddress = {
        email: "user@example.com",
        name: "User Name",
      };
      expect(addr.email).toBe("user@example.com");
    });

    it("EmailSignature type should be usable", () => {
      const sig: EmailSignature = {
        id: "sig1",
        name: "Default",
        content: "<p>Best regards</p>",
        isDefault: true,
      };
      expect(sig.name).toBe("Default");
    });

    it("EmailBranding type should be usable", () => {
      const branding: EmailBranding = {
        logoUrl: "https://example.com/logo.png",
        primaryColor: "#3b82f6",
        fontFamily: "Inter",
      };
      expect(branding.primaryColor).toBe("#3b82f6");
    });
  });

  describe("Type guards and utilities", () => {
    it("SharedMailbox should extend Mailbox", () => {
      const sharedMailbox: SharedMailbox = {
        id: "sm1",
        domainId: "d1",
        email: "shared@example.com",
        displayName: "Shared Mailbox",
        type: "shared",
        isDefault: false,
        unreadCount: 3,
        folders: [],
        members: [
          {
            userId: "u1",
            email: "owner@example.com",
            name: "Owner",
            role: "owner",
          },
        ],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true,
          canManage: true,
        },
      };
      expect(sharedMailbox.type).toBe("shared");
      expect(sharedMailbox.members).toHaveLength(1);
    });
  });
});
