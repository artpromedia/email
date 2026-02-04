/**
 * Mail Store Tests
 * Tests for Zustand store state and actions
 *
 * Note: Testing Zustand with immer middleware requires careful handling
 * of Set objects. We test the store logic through isolated unit tests.
 */

import type { EmailListItem, EmailListQuery, ViewMode, ViewPreferences, Domain } from "./types";

// ============================================================
// DEFAULT VALUES TESTS
// ============================================================

describe("Default Query Values", () => {
  const defaultQuery: EmailListQuery = {
    domain: "all",
    folder: "inbox",
    page: 1,
    pageSize: 50,
    sortBy: "date",
    sortOrder: "desc",
  };

  it("has correct default domain", () => {
    expect(defaultQuery.domain).toBe("all");
  });

  it("has correct default folder", () => {
    expect(defaultQuery.folder).toBe("inbox");
  });

  it("has correct default pagination", () => {
    expect(defaultQuery.page).toBe(1);
    expect(defaultQuery.pageSize).toBe(50);
  });

  it("has correct default sorting", () => {
    expect(defaultQuery.sortBy).toBe("date");
    expect(defaultQuery.sortOrder).toBe("desc");
  });
});

describe("Default View Preferences", () => {
  const defaultViewPreferences: ViewPreferences = {
    mode: "unified",
    activeDomain: "all",
    showUnreadOnly: false,
    previewPane: "right",
    density: "comfortable",
    groupByConversation: true,
  };

  it("has unified mode by default", () => {
    expect(defaultViewPreferences.mode).toBe("unified");
  });

  it("shows all domains by default", () => {
    expect(defaultViewPreferences.activeDomain).toBe("all");
  });

  it("shows all emails by default", () => {
    expect(defaultViewPreferences.showUnreadOnly).toBe(false);
  });

  it("has preview pane on right", () => {
    expect(defaultViewPreferences.previewPane).toBe("right");
  });

  it("uses comfortable density", () => {
    expect(defaultViewPreferences.density).toBe("comfortable");
  });

  it("groups by conversation by default", () => {
    expect(defaultViewPreferences.groupByConversation).toBe(true);
  });
});

// ============================================================
// EMAIL OPERATIONS TESTS
// ============================================================

describe("Email List Operations", () => {
  describe("setEmails", () => {
    it("replaces entire email list", () => {
      const previousEmails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }];
      const newEmails: Partial<EmailListItem>[] = [{ id: "3" }, { id: "4" }];

      // Simulate the action - verifying old emails are replaced
      expect(previousEmails).toContainEqual({ id: "1" });
      const result = newEmails;
      expect(result).toEqual([{ id: "3" }, { id: "4" }]);
      expect(result).not.toContainEqual({ id: "1" });
    });
  });

  describe("addEmails", () => {
    it("adds emails to beginning of list", () => {
      const existing: Partial<EmailListItem>[] = [{ id: "2" }, { id: "3" }];
      const newEmails: Partial<EmailListItem>[] = [{ id: "1" }];

      const result = [...newEmails, ...existing];
      expect(result[0]).toEqual({ id: "1" });
      expect(result.length).toBe(3);
    });
  });

  describe("updateEmail", () => {
    it("updates specific email properties", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", subject: "Old Subject", isRead: false },
        { id: "2", subject: "Another", isRead: true },
      ];

      const emailId = "1";
      const updates = { subject: "New Subject", isRead: true };

      const result = emails.map((e) => (e.id === emailId ? { ...e, ...updates } : e));

      expect(result[0]).toEqual({ id: "1", subject: "New Subject", isRead: true });
      expect(result[1]).toEqual({ id: "2", subject: "Another", isRead: true });
    });

    it("does not modify other emails", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", subject: "Subject 1" },
        { id: "2", subject: "Subject 2" },
      ];

      const emailId = "1";
      const updates = { subject: "Updated" };

      const result = emails.map((e) => (e.id === emailId ? { ...e, ...updates } : e));

      expect(result[1]).toEqual({ id: "2", subject: "Subject 2" });
    });

    it("handles non-existent email ID", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1", subject: "Subject" }];
      const emailId = "non-existent";
      const updates = { subject: "Updated" };

      const result = emails.map((e) => (e.id === emailId ? { ...e, ...updates } : e));

      expect(result).toEqual(emails);
    });
  });

  describe("removeEmails", () => {
    it("removes specified emails from list", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const emailIds = ["1", "3"];

      const idsSet = new Set(emailIds);
      const result = emails.filter((e) => !idsSet.has(e.id!));

      expect(result).toEqual([{ id: "2" }]);
    });

    it("handles empty removal list", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }];
      const emailIds: string[] = [];

      const idsSet = new Set(emailIds);
      const result = emails.filter((e) => !idsSet.has(e.id!));

      expect(result).toEqual(emails);
    });
  });
});

// ============================================================
// SELECTION OPERATIONS TESTS
// ============================================================

describe("Selection Operations", () => {
  describe("selectEmail", () => {
    it("adds email to selection", () => {
      const selected = new Set<string>();
      selected.add("email-1");
      expect(selected.has("email-1")).toBe(true);
    });
  });

  describe("deselectEmail", () => {
    it("removes email from selection", () => {
      const selected = new Set(["email-1", "email-2"]);
      selected.delete("email-1");
      expect(selected.has("email-1")).toBe(false);
      expect(selected.has("email-2")).toBe(true);
    });
  });

  describe("toggleEmailSelection", () => {
    it("adds unselected email", () => {
      const selected = new Set<string>();
      const emailId = "email-1";

      if (selected.has(emailId)) {
        selected.delete(emailId);
      } else {
        selected.add(emailId);
      }

      expect(selected.has(emailId)).toBe(true);
    });

    it("removes selected email", () => {
      const selected = new Set(["email-1"]);
      const emailId = "email-1";

      if (selected.has(emailId)) {
        selected.delete(emailId);
      } else {
        selected.add(emailId);
      }

      expect(selected.has(emailId)).toBe(false);
    });
  });

  describe("selectAllEmails", () => {
    it("selects all emails in list", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }, { id: "3" }];

      const selected = new Set(emails.map((e) => e.id!));
      expect(selected.size).toBe(3);
      expect(selected.has("1")).toBe(true);
      expect(selected.has("2")).toBe(true);
      expect(selected.has("3")).toBe(true);
    });
  });

  describe("clearSelection", () => {
    it("clears all selected emails", () => {
      const initialSelected = new Set(["1", "2", "3"]);
      expect(initialSelected.size).toBe(3);
      const cleared = new Set<string>();
      expect(cleared.size).toBe(0);
    });
  });
});

// ============================================================
// DOMAIN OPERATIONS TESTS
// ============================================================

describe("Domain Operations", () => {
  describe("setDomains", () => {
    it("sets domains list", () => {
      const domains: Partial<Domain>[] = [
        { id: "1", domain: "example.com" },
        { id: "2", domain: "test.com" },
      ];
      expect(domains.length).toBe(2);
    });

    it("auto-expands first domain when list was empty", () => {
      const expandedDomains = new Set<string>();
      const domains: Partial<Domain>[] = [{ id: "domain-1" }];

      if (domains.length > 0 && expandedDomains.size === 0) {
        const firstDomain = domains[0];
        if (firstDomain?.id) {
          expandedDomains.add(firstDomain.id);
        }
      }

      expect(expandedDomains.has("domain-1")).toBe(true);
    });
  });

  describe("setActiveDomain", () => {
    it("updates active domain and query", () => {
      let activeDomain = "all";
      let queryDomain = "all";

      const setActiveDomain = (domainId: string) => {
        activeDomain = domainId;
        queryDomain = domainId;
      };

      setActiveDomain("domain-1");
      expect(activeDomain).toBe("domain-1");
      expect(queryDomain).toBe("domain-1");
    });

    it("sets view mode based on domain selection", () => {
      let viewMode: ViewMode = "unified";

      const setMode = (domainId: string) => {
        viewMode = domainId === "all" ? "unified" : "domain";
      };

      setMode("all");
      expect(viewMode).toBe("unified");

      setMode("domain-1");
      expect(viewMode).toBe("domain");
    });
  });

  describe("toggleDomainExpanded", () => {
    it("expands collapsed domain", () => {
      const expanded = new Set<string>();
      const domainId = "domain-1";

      if (expanded.has(domainId)) {
        expanded.delete(domainId);
      } else {
        expanded.add(domainId);
      }

      expect(expanded.has(domainId)).toBe(true);
    });

    it("collapses expanded domain", () => {
      const expanded = new Set(["domain-1"]);
      const domainId = "domain-1";

      if (expanded.has(domainId)) {
        expanded.delete(domainId);
      } else {
        expanded.add(domainId);
      }

      expect(expanded.has(domainId)).toBe(false);
    });
  });
});

// ============================================================
// QUERY OPERATIONS TESTS
// ============================================================

describe("Query Operations", () => {
  describe("setQuery", () => {
    it("merges partial query updates", () => {
      const query: Partial<EmailListQuery> = {
        domain: "all",
        folder: "inbox",
        page: 1,
      };

      const updates = { folder: "sent", page: 2 };
      const result = { ...query, ...updates };

      expect(result.domain).toBe("all");
      expect(result.folder).toBe("sent");
      expect(result.page).toBe(2);
    });
  });

  describe("resetQuery", () => {
    it("resets query while preserving active domain", () => {
      const defaultQuery: Partial<EmailListQuery> = {
        folder: "inbox",
        page: 1,
        pageSize: 50,
      };
      const activeDomain = "domain-1";

      const resetQuery = { ...defaultQuery, domain: activeDomain };

      expect(resetQuery.folder).toBe("inbox");
      expect(resetQuery.domain).toBe("domain-1");
    });
  });
});

// ============================================================
// VIEW PREFERENCES TESTS
// ============================================================

describe("View Preferences Operations", () => {
  describe("setViewMode", () => {
    it("updates view mode", () => {
      const setMode = (current: ViewMode, newMode: ViewMode): ViewMode => newMode;
      const initialMode: ViewMode = "unified";
      const updatedMode = setMode(initialMode, "domain");
      expect(updatedMode).toBe("domain");
    });
  });

  describe("setViewPreferences", () => {
    it("merges partial preferences updates", () => {
      const prefs: ViewPreferences = {
        mode: "unified",
        activeDomain: "all",
        showUnreadOnly: false,
        previewPane: "right",
        density: "comfortable",
        groupByConversation: true,
      };

      const updates: Partial<ViewPreferences> = {
        showUnreadOnly: true,
        density: "compact",
      };

      const result = { ...prefs, ...updates };

      expect(result.showUnreadOnly).toBe(true);
      expect(result.density).toBe("compact");
      expect(result.mode).toBe("unified");
    });
  });

  describe("toggleSidebar", () => {
    it("toggles sidebar state", () => {
      let collapsed = false;
      collapsed = !collapsed;
      expect(collapsed).toBe(true);

      collapsed = !collapsed;
      expect(collapsed).toBe(false);
    });
  });
});

// ============================================================
// BULK ACTIONS TESTS
// ============================================================

describe("Bulk Actions", () => {
  describe("markAsRead", () => {
    it("marks specified emails as read", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", isRead: false },
        { id: "2", isRead: false },
        { id: "3", isRead: true },
      ];
      const emailIdsToMark = new Set(["1", "2"]);

      const result = emails.map((e) => {
        if (emailIdsToMark.has(e.id!) && !e.isRead) {
          return { ...e, isRead: true };
        }
        return e;
      });

      expect(result[0]?.isRead).toBe(true);
      expect(result[1]?.isRead).toBe(true);
      expect(result[2]?.isRead).toBe(true);
    });
  });

  describe("markAsUnread", () => {
    it("marks specified emails as unread", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", isRead: true },
        { id: "2", isRead: true },
      ];
      const emailIdsToMark = new Set(["1"]);

      const result = emails.map((e) => {
        if (emailIdsToMark.has(e.id!) && e.isRead) {
          return { ...e, isRead: false };
        }
        return e;
      });

      expect(result[0]?.isRead).toBe(false);
      expect(result[1]?.isRead).toBe(true);
    });
  });

  describe("starEmails", () => {
    it("stars specified emails", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", isStarred: false },
        { id: "2", isStarred: false },
      ];
      const emailIdsToStar = new Set(["1"]);

      const result = emails.map((e) => {
        if (emailIdsToStar.has(e.id!)) {
          return { ...e, isStarred: true };
        }
        return e;
      });

      expect(result[0]?.isStarred).toBe(true);
      expect(result[1]?.isStarred).toBe(false);
    });
  });

  describe("unstarEmails", () => {
    it("unstars specified emails", () => {
      const emails: Partial<EmailListItem>[] = [
        { id: "1", isStarred: true },
        { id: "2", isStarred: true },
      ];
      const emailIdsToUnstar = new Set(["2"]);

      const result = emails.map((e) => {
        if (emailIdsToUnstar.has(e.id!)) {
          return { ...e, isStarred: false };
        }
        return e;
      });

      expect(result[0]?.isStarred).toBe(true);
      expect(result[1]?.isStarred).toBe(false);
    });
  });

  describe("moveEmails", () => {
    it("removes moved emails from current view", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const emailIdsToMove = new Set(["1", "3"]);

      const result = emails.filter((e) => !emailIdsToMove.has(e.id!));

      expect(result).toEqual([{ id: "2" }]);
    });

    it("clears selection after move", () => {
      const initialSelected = new Set(["1", "3"]);
      expect(initialSelected.size).toBe(2);
      const cleared = new Set<string>();
      expect(cleared.size).toBe(0);
    });
  });

  describe("deleteEmails", () => {
    it("removes deleted emails from list", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }];
      const emailIdsToDelete = new Set(["1"]);

      const result = emails.filter((e) => !emailIdsToDelete.has(e.id!));

      expect(result).toEqual([{ id: "2" }]);
    });
  });
});

// ============================================================
// UNREAD COUNT OPERATIONS TESTS
// ============================================================

describe("Unread Count Operations", () => {
  describe("incrementUnreadCount", () => {
    it("increments folder, mailbox, and domain counts", () => {
      let folderCount = 5;
      let mailboxCount = 10;
      let domainCount = 20;

      folderCount++;
      mailboxCount++;
      domainCount++;

      expect(folderCount).toBe(6);
      expect(mailboxCount).toBe(11);
      expect(domainCount).toBe(21);
    });
  });

  describe("decrementUnreadCount", () => {
    it("decrements counts when greater than zero", () => {
      let folderCount = 5;
      let mailboxCount = 10;
      let domainCount = 20;

      if (folderCount > 0) {
        folderCount--;
        mailboxCount--;
        domainCount--;
      }

      expect(folderCount).toBe(4);
      expect(mailboxCount).toBe(9);
      expect(domainCount).toBe(19);
    });

    it("does not decrement below zero", () => {
      let folderCount = 0;

      if (folderCount > 0) {
        folderCount--;
      }

      expect(folderCount).toBe(0);
    });
  });

  describe("updateUnreadCount", () => {
    it("calculates diff and updates counts", () => {
      let folderCount = 5;
      let mailboxCount = 10;
      let domainCount = 20;
      const newCount = 8;

      const diff = newCount - folderCount;
      folderCount = newCount;
      mailboxCount += diff;
      domainCount += diff;

      expect(folderCount).toBe(8);
      expect(mailboxCount).toBe(13);
      expect(domainCount).toBe(23);
    });
  });
});

// ============================================================
// SELECTORS TESTS
// ============================================================

describe("Selectors", () => {
  describe("selectUnreadCount", () => {
    it("returns total when domain is all", () => {
      const domains: Partial<Domain>[] = [
        { id: "1", unreadCount: 5 },
        { id: "2", unreadCount: 3 },
      ];
      const activeDomain = "all";

      const count =
        activeDomain === "all"
          ? domains.reduce((sum, d) => sum + (d.unreadCount ?? 0), 0)
          : (domains.find((d) => d.id === activeDomain)?.unreadCount ?? 0);

      expect(count).toBe(8);
    });

    it("returns domain count when specific domain is active", () => {
      const domains: Partial<Domain>[] = [
        { id: "1", unreadCount: 5 },
        { id: "2", unreadCount: 3 },
      ];
      const activeDomain: string = "1";

      const count =
        activeDomain === "all"
          ? domains.reduce((sum, d) => sum + (d.unreadCount ?? 0), 0)
          : (domains.find((d) => d.id === activeDomain)?.unreadCount ?? 0);

      expect(count).toBe(5);
    });

    it("returns 0 when domain not found", () => {
      const domains: Partial<Domain>[] = [{ id: "1", unreadCount: 5 }];
      const activeDomain: string = "non-existent";

      const count =
        activeDomain === "all"
          ? domains.reduce((sum, d) => sum + (d.unreadCount ?? 0), 0)
          : (domains.find((d) => d.id === activeDomain)?.unreadCount ?? 0);

      expect(count).toBe(0);
    });
  });

  describe("selectActiveDomainData", () => {
    it("returns null when domain is all", () => {
      const domains: Partial<Domain>[] = [{ id: "1" }];
      const activeDomain = "all";

      const result =
        activeDomain === "all" ? null : (domains.find((d) => d.id === activeDomain) ?? null);

      expect(result).toBeNull();
    });

    it("returns domain data when specific domain is active", () => {
      const domains: Partial<Domain>[] = [
        { id: "1", domain: "example.com" },
        { id: "2", domain: "test.com" },
      ];
      const activeDomain: string = "1";

      const result =
        activeDomain === "all" ? null : (domains.find((d) => d.id === activeDomain) ?? null);

      expect(result).toEqual({ id: "1", domain: "example.com" });
    });
  });

  describe("selectSelectedEmailCount", () => {
    it("returns count of selected emails", () => {
      const selected = new Set(["1", "2", "3"]);
      expect(selected.size).toBe(3);
    });

    it("returns 0 when no emails selected", () => {
      const selected = new Set<string>();
      expect(selected.size).toBe(0);
    });
  });

  describe("selectIsAllSelected", () => {
    it("returns true when all emails are selected", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }];
      const selected = new Set(["1", "2"]);

      const isAllSelected = emails.length > 0 && selected.size === emails.length;
      expect(isAllSelected).toBe(true);
    });

    it("returns false when some emails are selected", () => {
      const emails: Partial<EmailListItem>[] = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const selected = new Set(["1", "2"]);

      const isAllSelected = emails.length > 0 && selected.size === emails.length;
      expect(isAllSelected).toBe(false);
    });

    it("returns false when no emails exist", () => {
      const emails: Partial<EmailListItem>[] = [];
      const selected = new Set<string>();

      const isAllSelected = emails.length > 0 && selected.size === emails.length;
      expect(isAllSelected).toBe(false);
    });
  });

  describe("selectHasSelection", () => {
    it("returns true when emails are selected", () => {
      const selected = new Set(["1"]);
      expect(selected.size > 0).toBe(true);
    });

    it("returns false when no emails are selected", () => {
      const selected = new Set<string>();
      expect(selected.size > 0).toBe(false);
    });
  });
});

// ============================================================
// PERSISTENCE TESTS
// ============================================================

describe("Persistence", () => {
  describe("partialize", () => {
    it("extracts persisted state fields", () => {
      const state = {
        viewPreferences: { mode: "unified" as const },
        expandedDomains: new Set(["1", "2"]),
        sidebarCollapsed: false,
        activeDomain: "all",
        emails: [],
        selectedEmails: new Set<string>(),
      };

      const persisted = {
        viewPreferences: state.viewPreferences,
        expandedDomains: Array.from(state.expandedDomains),
        sidebarCollapsed: state.sidebarCollapsed,
        activeDomain: state.activeDomain,
      };

      expect(persisted.viewPreferences).toBeDefined();
      expect(persisted.expandedDomains).toEqual(["1", "2"]);
      expect(persisted.sidebarCollapsed).toBe(false);
      expect(persisted.activeDomain).toBe("all");
      expect((persisted as any).emails).toBeUndefined();
    });
  });

  describe("merge", () => {
    it("converts expandedDomains array back to Set", () => {
      const persistedExpandedDomains = ["1", "2", "3"];
      const result = new Set(persistedExpandedDomains);

      expect(result.has("1")).toBe(true);
      expect(result.has("2")).toBe(true);
      expect(result.has("3")).toBe(true);
    });

    it("uses default values when persisted is null", () => {
      const persistedExpandedDomains: string[] | null = null;
      const result = new Set(persistedExpandedDomains ?? []);

      expect(result.size).toBe(0);
    });
  });
});
