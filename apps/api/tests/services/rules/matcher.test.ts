import { describe, it, expect, beforeEach } from "vitest";
import { Message } from "@prisma/client";
import {
  evaluateCondition,
  evaluateConditions,
  normalizeText,
} from "../../../src/services/rules/matcher";
import { Condition } from "../../../src/services/rules/types";

describe("Rules Matcher", () => {
  let sampleMessage: Message;

  beforeEach(() => {
    sampleMessage = {
      id: "msg1",
      messageId: "<test@example.com>",
      threadId: null,
      userId: "user1",
      from: "Alice <alice@example.com>",
      to: ["bob@example.com"],
      cc: [],
      bcc: [],
      subject: "Important Meeting Tomorrow",
      body: "Please review the attached documents before our meeting.",
      htmlBody: null,
      flags: ["unread"],
      folder: "inbox",
      priority: "high",
      sentAt: new Date("2024-01-15T10:00:00Z"),
      receivedAt: new Date("2024-01-15T10:05:00Z"),
      snoozedUntil: null,
      createdAt: new Date("2024-01-15T10:05:00Z"),
      updatedAt: new Date("2024-01-15T10:05:00Z"),
    };
  });

  describe("normalizeText", () => {
    it("should convert to lowercase", () => {
      expect(normalizeText("HELLO WORLD")).toBe("hello world");
    });

    it("should remove diacritics", () => {
      expect(normalizeText("café")).toBe("cafe");
      expect(normalizeText("naïve")).toBe("naive");
      expect(normalizeText("résumé")).toBe("resume");
    });

    it("should handle mixed case and diacritics", () => {
      expect(normalizeText("Café RÉSUMÉ")).toBe("cafe resume");
    });
  });

  describe("evaluateCondition", () => {
    describe("from field conditions", () => {
      it("should match exact from address", () => {
        const condition: Condition = {
          id: "1",
          type: "from",
          operator: "equals",
          value: "Alice <alice@example.com>",
          caseSensitive: true,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should match from address case-insensitively", () => {
        const condition: Condition = {
          id: "1",
          type: "from",
          operator: "equals",
          value: "alice <alice@example.com>",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should match from address with contains", () => {
        const condition: Condition = {
          id: "1",
          type: "from",
          operator: "contains",
          value: "alice@example.com",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should not match different from address", () => {
        const condition: Condition = {
          id: "1",
          type: "from",
          operator: "equals",
          value: "bob@example.com",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(false);
      });
    });

    describe("subject field conditions", () => {
      it("should match subject with contains", () => {
        const condition: Condition = {
          id: "1",
          type: "subject",
          operator: "contains",
          value: "meeting",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should match subject with starts_with", () => {
        const condition: Condition = {
          id: "1",
          type: "subject",
          operator: "starts_with",
          value: "important",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should match subject with ends_with", () => {
        const condition: Condition = {
          id: "1",
          type: "subject",
          operator: "ends_with",
          value: "tomorrow",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should respect case sensitivity", () => {
        const condition: Condition = {
          id: "1",
          type: "subject",
          operator: "contains",
          value: "MEETING",
          caseSensitive: true,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(false);
      });
    });

    describe("body field conditions", () => {
      it("should match body content", () => {
        const condition: Condition = {
          id: "1",
          type: "body",
          operator: "contains",
          value: "documents",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should handle regex matching", () => {
        const condition: Condition = {
          id: "1",
          type: "body",
          operator: "matches_regex",
          value: "\\b(review|check)\\b",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should handle invalid regex gracefully", () => {
        const condition: Condition = {
          id: "1",
          type: "body",
          operator: "matches_regex",
          value: "[invalid regex",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(false);
      });
    });

    describe("sender domain conditions", () => {
      it("should extract and match sender domain", () => {
        const condition: Condition = {
          id: "1",
          type: "sender_domain",
          operator: "equals",
          value: "example.com",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should handle plain email format", () => {
        sampleMessage.from = "alice@test.org";
        const condition: Condition = {
          id: "1",
          type: "sender_domain",
          operator: "equals",
          value: "test.org",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });
    });

    describe("priority conditions", () => {
      it("should match priority exactly", () => {
        const condition: Condition = {
          id: "1",
          type: "priority",
          operator: "equals",
          value: "high",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should match priority in list", () => {
        const condition: Condition = {
          id: "1",
          type: "priority",
          operator: "in_list",
          value: ["high", "urgent"],
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });
    });

    describe("folder conditions", () => {
      it("should match folder", () => {
        const condition: Condition = {
          id: "1",
          type: "folder",
          operator: "equals",
          value: "inbox",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should not match different folder", () => {
        const condition: Condition = {
          id: "1",
          type: "folder",
          operator: "equals",
          value: "spam",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(false);
      });
    });

    describe("numeric conditions", () => {
      it("should handle greater_than for size", () => {
        const condition: Condition = {
          id: "1",
          type: "size_greater_than",
          operator: "greater_than",
          value: 10,
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should handle less_than for size", () => {
        const condition: Condition = {
          id: "1",
          type: "size_less_than",
          operator: "less_than",
          value: 1000,
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });
    });

    describe("empty/not empty conditions", () => {
      it("should detect empty cc field", () => {
        const condition: Condition = {
          id: "1",
          type: "cc",
          operator: "is_empty",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should detect non-empty to field", () => {
        const condition: Condition = {
          id: "1",
          type: "to",
          operator: "is_not_empty",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });
    });

    describe("array field conditions", () => {
      it("should match any value in to array", () => {
        const condition: Condition = {
          id: "1",
          type: "to",
          operator: "contains",
          value: "bob@example.com",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });

      it("should handle multiple recipients", () => {
        sampleMessage.to = ["bob@example.com", "charlie@test.com"];
        const condition: Condition = {
          id: "1",
          type: "to",
          operator: "contains",
          value: "charlie",
          caseSensitive: false,
        };
        expect(evaluateCondition(condition, sampleMessage)).toBe(true);
      });
    });
  });

  describe("evaluateConditions", () => {
    it("should return true when all conditions match (AND logic)", () => {
      const conditions: Condition[] = [
        {
          id: "1",
          type: "from",
          operator: "contains",
          value: "alice",
          caseSensitive: false,
        },
        {
          id: "2",
          type: "subject",
          operator: "contains",
          value: "meeting",
          caseSensitive: false,
        },
      ];
      expect(evaluateConditions(conditions, sampleMessage)).toBe(true);
    });

    it("should return false when any condition fails", () => {
      const conditions: Condition[] = [
        {
          id: "1",
          type: "from",
          operator: "contains",
          value: "alice",
          caseSensitive: false,
        },
        {
          id: "2",
          type: "subject",
          operator: "contains",
          value: "nonexistent",
          caseSensitive: false,
        },
      ];
      expect(evaluateConditions(conditions, sampleMessage)).toBe(false);
    });

    it("should handle empty conditions array", () => {
      expect(evaluateConditions([], sampleMessage)).toBe(true);
    });

    it("should handle complex multi-condition scenarios", () => {
      const conditions: Condition[] = [
        {
          id: "1",
          type: "priority",
          operator: "equals",
          value: "high",
          caseSensitive: false,
        },
        {
          id: "2",
          type: "folder",
          operator: "equals",
          value: "inbox",
          caseSensitive: false,
        },
        {
          id: "3",
          type: "body",
          operator: "contains",
          value: "meeting",
          caseSensitive: false,
        },
      ];
      expect(evaluateConditions(conditions, sampleMessage)).toBe(true);
    });
  });
});
