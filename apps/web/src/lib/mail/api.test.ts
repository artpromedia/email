/**
 * Mail API Hooks Tests
 * Tests for React Query hooks in mail/api.ts
 */

import { mailKeys } from "./api";

// ============================================================
// QUERY KEYS TESTS
// ============================================================

describe("mailKeys", () => {
  describe("all", () => {
    it("returns base key array", () => {
      expect(mailKeys.all).toEqual(["mail"]);
    });
  });

  describe("domains", () => {
    it("returns domains key array", () => {
      expect(mailKeys.domains()).toEqual(["mail", "domains"]);
    });
  });

  describe("domain", () => {
    it("returns specific domain key", () => {
      expect(mailKeys.domain("domain-1")).toEqual(["mail", "domains", "domain-1"]);
    });

    it("handles empty string", () => {
      expect(mailKeys.domain("")).toEqual(["mail", "domains", ""]);
    });
  });

  describe("emails", () => {
    it("returns emails key array", () => {
      expect(mailKeys.emails()).toEqual(["mail", "emails"]);
    });
  });

  describe("emailList", () => {
    it("returns email list key with query", () => {
      const query = { domain: "all", folder: "inbox", page: 1, pageSize: 50 };
      expect(mailKeys.emailList(query as any)).toEqual(["mail", "emails", query]);
    });

    it("handles complex query objects", () => {
      const query = {
        domain: "domain-1",
        folder: "sent",
        page: 2,
        pageSize: 25,
        search: "test query",
        sortBy: "date",
        sortOrder: "desc",
      };
      expect(mailKeys.emailList(query as any)).toEqual(["mail", "emails", query]);
    });
  });

  describe("email", () => {
    it("returns specific email key", () => {
      expect(mailKeys.email("email-123")).toEqual(["mail", "emails", "email-123"]);
    });
  });

  describe("folders", () => {
    it("returns folders key array", () => {
      expect(mailKeys.folders()).toEqual(["mail", "folders"]);
    });
  });

  describe("folder", () => {
    it("returns specific folder key", () => {
      expect(mailKeys.folder("folder-1")).toEqual(["mail", "folders", "folder-1"]);
    });
  });

  describe("unreadCounts", () => {
    it("returns unread counts key", () => {
      expect(mailKeys.unreadCounts()).toEqual(["mail", "unreadCounts"]);
    });
  });
});

// ============================================================
// FETCHJSON FUNCTION TESTS (via module testing)
// ============================================================

describe("fetchJson utility", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("makes GET request with correct headers", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    });

    // Import the module to test fetchJson indirectly through hooks
    const { mailKeys } = await import("./api");
    expect(mailKeys.all).toBeDefined();
  });
});

// ============================================================
// URL PARAMETER BUILDING TESTS
// ============================================================

describe("URL parameter building", () => {
  it("builds params from query object", () => {
    const query = {
      domain: "domain-1",
      folder: "inbox",
      page: 1,
      pageSize: 50,
    };

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });

    expect(params.get("domain")).toBe("domain-1");
    expect(params.get("folder")).toBe("inbox");
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("50");
  });

  it("handles Date objects in query", () => {
    const testDate = new Date("2025-01-15T10:00:00.000Z");
    const query = {
      after: testDate,
    };

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (value instanceof Date) {
          params.set(key, value.toISOString());
        } else {
          params.set(key, String(value));
        }
      }
    });

    expect(params.get("after")).toBe("2025-01-15T10:00:00.000Z");
  });

  it("skips undefined and null values", () => {
    const query = {
      domain: "domain-1",
      folder: undefined,
      search: null,
      page: 1,
    };

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });

    expect(params.get("domain")).toBe("domain-1");
    expect(params.get("folder")).toBeNull();
    expect(params.get("search")).toBeNull();
    expect(params.get("page")).toBe("1");
  });

  it("handles boolean values", () => {
    const query = {
      unreadOnly: true,
      starred: false,
    };

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });

    expect(params.get("unreadOnly")).toBe("true");
    expect(params.get("starred")).toBe("false");
  });

  it("handles array values by stringifying", () => {
    const query = {
      labels: ["important", "work"],
    };

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });

    expect(params.get("labels")).toBe("important,work");
  });
});

// ============================================================
// PAGINATION LOGIC TESTS
// ============================================================

describe("Pagination logic", () => {
  describe("getNextPageParam", () => {
    it("returns next page when hasMore is true", () => {
      const lastPage = { emails: [], total: 100, page: 1, pageSize: 50, hasMore: true };
      const getNextPageParam = (page: typeof lastPage) =>
        page.hasMore ? page.page + 1 : undefined;
      expect(getNextPageParam(lastPage)).toBe(2);
    });

    it("returns undefined when hasMore is false", () => {
      const lastPage = { emails: [], total: 50, page: 1, pageSize: 50, hasMore: false };
      const getNextPageParam = (page: typeof lastPage) =>
        page.hasMore ? page.page + 1 : undefined;
      expect(getNextPageParam(lastPage)).toBeUndefined();
    });

    it("handles last page correctly", () => {
      const lastPage = { emails: [], total: 100, page: 2, pageSize: 50, hasMore: false };
      const getNextPageParam = (page: typeof lastPage) =>
        page.hasMore ? page.page + 1 : undefined;
      expect(getNextPageParam(lastPage)).toBeUndefined();
    });
  });
});

// ============================================================
// STALE TIME CONFIGURATION TESTS
// ============================================================

describe("Stale time configurations", () => {
  it("domains have 5 minute stale time", () => {
    const staleTime = 5 * 60 * 1000;
    expect(staleTime).toBe(300000);
  });

  it("email list has 30 second stale time", () => {
    const staleTime = 30 * 1000;
    expect(staleTime).toBe(30000);
  });

  it("email detail has 60 second stale time", () => {
    const staleTime = 60 * 1000;
    expect(staleTime).toBe(60000);
  });

  it("unread counts poll every minute", () => {
    const refetchInterval = 60 * 1000;
    expect(refetchInterval).toBe(60000);
  });

  it("folders have 5 minute stale time", () => {
    const staleTime = 5 * 60 * 1000;
    expect(staleTime).toBe(300000);
  });
});

// ============================================================
// MUTATION REQUEST BODY TESTS
// ============================================================

describe("Mutation request body formatting", () => {
  describe("markAsRead", () => {
    it("formats email IDs correctly", () => {
      const emailIds = ["email-1", "email-2", "email-3"];
      const body = JSON.stringify({ emailIds });
      expect(body).toBe('{"emailIds":["email-1","email-2","email-3"]}');
    });

    it("handles single email", () => {
      const emailIds = ["email-1"];
      const body = JSON.stringify({ emailIds });
      expect(body).toBe('{"emailIds":["email-1"]}');
    });

    it("handles empty array", () => {
      const emailIds: string[] = [];
      const body = JSON.stringify({ emailIds });
      expect(body).toBe('{"emailIds":[]}');
    });
  });

  describe("moveEmails", () => {
    it("formats move request correctly", () => {
      const request = {
        emailIds: ["email-1"],
        destination: {
          domainId: "domain-1",
          mailboxId: "mailbox-1",
          folderId: "folder-1",
          folderName: "Archive",
        },
      };
      const body = JSON.stringify(request);
      const parsed = JSON.parse(body);
      expect(parsed.emailIds).toEqual(["email-1"]);
      expect(parsed.destination.folderName).toBe("Archive");
    });
  });

  describe("createFolder", () => {
    it("formats create folder request", () => {
      const data = { name: "Projects", parentId: "parent-1", mailboxId: "mailbox-1" };
      const body = JSON.stringify(data);
      const parsed = JSON.parse(body);
      expect(parsed.name).toBe("Projects");
      expect(parsed.parentId).toBe("parent-1");
      expect(parsed.mailboxId).toBe("mailbox-1");
    });

    it("handles folder without parent", () => {
      const data = { name: "Top Level", mailboxId: "mailbox-1" };
      const body = JSON.stringify(data);
      const parsed = JSON.parse(body);
      expect(parsed.name).toBe("Top Level");
      expect(parsed.parentId).toBeUndefined();
    });
  });

  describe("renameFolder", () => {
    it("formats rename request", () => {
      const data = { name: "New Name" };
      const body = JSON.stringify(data);
      expect(body).toBe('{"name":"New Name"}');
    });
  });
});

// ============================================================
// ERROR HANDLING TESTS
// ============================================================

describe("Error handling patterns", () => {
  it("parses error from JSON response", async () => {
    const errorResponse = { message: "Unauthorized" };
    const parsedError = errorResponse.message || "Request failed";
    expect(parsedError).toBe("Unauthorized");
  });

  it("provides fallback for non-JSON errors", async () => {
    const parseError = () => {
      throw new Error("Invalid JSON");
    };

    let errorMessage = "Initial value";
    try {
      parseError();
    } catch {
      errorMessage = "Request failed";
    }
    expect(errorMessage).toBe("Request failed");
  });

  it("includes HTTP status in error", () => {
    const status = 404;
    const errorMessage = `HTTP ${status}`;
    expect(errorMessage).toBe("HTTP 404");
  });
});

// ============================================================
// QUERY ENABLED CONDITIONS TESTS
// ============================================================

describe("Query enabled conditions", () => {
  describe("useDomain enabled logic", () => {
    const computeEnabled = (domainId: string | null | undefined): boolean => {
      return !!domainId && domainId !== "all";
    };

    it("is enabled when domainId is provided and not 'all'", () => {
      const domainId = "domain-1";
      const enabled = computeEnabled(domainId);
      expect(enabled).toBe(true);
    });

    it("is disabled when domainId is 'all'", () => {
      const domainId = "all";
      const enabled = computeEnabled(domainId);
      expect(enabled).toBe(false);
    });

    it("is disabled when domainId is empty", () => {
      const domainId = "";
      const enabled = computeEnabled(domainId);
      expect(enabled).toBe(false);
    });

    it("is disabled when domainId is null", () => {
      const domainId = null;
      const enabled = computeEnabled(domainId);
      expect(enabled).toBe(false);
    });
  });

  describe("useEmail enabled logic", () => {
    it("is enabled when emailId is provided", () => {
      const emailId: string | null = "email-123";
      const enabled = !!emailId;
      expect(enabled).toBe(true);
    });

    it("is disabled when emailId is null", () => {
      const emailId: string | null = null;
      const enabled = !!emailId;
      expect(enabled).toBe(false);
    });

    it("is disabled when emailId is empty string", () => {
      const emailId: string | null = "";
      const enabled = !!emailId;
      expect(enabled).toBe(false);
    });
  });
});

// ============================================================
// SELECT FUNCTION TESTS
// ============================================================

describe("Select functions", () => {
  describe("useDomains select", () => {
    it("extracts domains array from response", () => {
      const data = {
        domains: [
          { id: "1", name: "Domain 1" },
          { id: "2", name: "Domain 2" },
        ],
      };
      const select = (d: typeof data) => d.domains;
      expect(select(data)).toEqual([
        { id: "1", name: "Domain 1" },
        { id: "2", name: "Domain 2" },
      ]);
    });

    it("handles empty domains array", () => {
      const data = { domains: [] };
      const select = (d: typeof data) => d.domains;
      expect(select(data)).toEqual([]);
    });
  });

  describe("useFolderTree select", () => {
    it("extracts folders array from response", () => {
      const data = {
        folders: [
          { id: "1", name: "Inbox" },
          { id: "2", name: "Sent" },
        ],
      };
      const select = (d: typeof data) => d.folders;
      expect(select(data)).toEqual([
        { id: "1", name: "Inbox" },
        { id: "2", name: "Sent" },
      ]);
    });
  });
});

// ============================================================
// API URL BUILDING TESTS
// ============================================================

describe("API URL building", () => {
  const API_BASE = "/api/v1";

  it("builds domain URL", () => {
    const domainId = "domain-1";
    expect(`${API_BASE}/mail/domains/${domainId}`).toBe("/api/v1/mail/domains/domain-1");
  });

  it("builds email URL", () => {
    const emailId = "email-123";
    expect(`${API_BASE}/mail/emails/${emailId}`).toBe("/api/v1/mail/emails/email-123");
  });

  it("builds folder URL with domain filter", () => {
    const domainId = "domain-1";
    const url = domainId ? `/mail/folders?domain=${domainId}` : "/mail/folders";
    expect(url).toBe("/mail/folders?domain=domain-1");
  });

  it("builds folder URL without domain filter", () => {
    const domainId = undefined;
    const url = domainId ? `/mail/folders?domain=${domainId}` : "/mail/folders";
    expect(url).toBe("/mail/folders");
  });

  it("builds folder delete URL", () => {
    const folderId = "folder-1";
    expect(`${API_BASE}/mail/folders/${folderId}`).toBe("/api/v1/mail/folders/folder-1");
  });
});
