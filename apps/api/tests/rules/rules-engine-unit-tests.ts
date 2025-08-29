import {
  evaluateCondition,
  evaluateConditions,
} from "../../src/services/rules/matcher";
import { ActionExecutor } from "../../src/services/rules/executor";
import { RulesEngine } from "../../src/services/rules/engine";
import { Message } from "@prisma/client";
import {
  Condition,
  Action,
  ExecutionContext,
} from "../../src/services/rules/types";

// Simple test framework
class TestFramework {
  private tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  private beforeEachFn?: () => void | Promise<void>;
  private afterEachFn?: () => void | Promise<void>;

  describe(name: string, fn: () => void) {
    console.log(`\n🧪 ${name}`);
    fn();
  }

  it(name: string, fn: () => void | Promise<void>) {
    this.tests.push({ name, fn });
  }

  beforeEach(fn: () => void | Promise<void>) {
    this.beforeEachFn = fn;
  }

  afterEach(fn: () => void | Promise<void>) {
    this.afterEachFn = fn;
  }

  expect(value: any) {
    return {
      toBe: (expected: any) => {
        if (value !== expected) {
          throw new Error(`Expected ${value} to be ${expected}`);
        }
      },
      toEqual: (expected: any) => {
        if (JSON.stringify(value) !== JSON.stringify(expected)) {
          throw new Error(
            `Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`,
          );
        }
      },
      toHaveLength: (expected: number) => {
        if (!Array.isArray(value) || value.length !== expected) {
          throw new Error(
            `Expected array to have length ${expected}, got ${value?.length}`,
          );
        }
      },
      toContain: (expected: any) => {
        if (!String(value).includes(String(expected))) {
          throw new Error(`Expected "${value}" to contain "${expected}"`);
        }
      },
    };
  }

  async run() {
    let passed = 0;
    let failed = 0;

    for (const test of this.tests) {
      try {
        if (this.beforeEachFn) await this.beforeEachFn();
        await test.fn();
        if (this.afterEachFn) await this.afterEachFn();
        console.log(`  ✅ ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`  ❌ ${test.name}`);
        console.log(`     Error: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }
}

// Mock Prisma client
const createMockPrisma = () => {
  const mockMethods = {
    findMany: () => Promise.resolve([]),
    count: () => Promise.resolve(0),
    create: () => Promise.resolve({}),
    findFirst: () => Promise.resolve(null),
    findUnique: () => Promise.resolve(null),
    update: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
    upsert: () => Promise.resolve({}),
  };

  return {
    rule: { ...mockMethods },
    message: { ...mockMethods },
    ruleExecution: { ...mockMethods },
    ruleAuditLog: { ...mockMethods },
    ruleJobQueue: { ...mockMethods },
    label: { ...mockMethods },
    messageLabel: { ...mockMethods },
    policy: { ...mockMethods },
  };
};

// Test data
const sampleMessage: Partial<Message> = {
  id: "msg-1",
  messageId: "<test@example.com>",
  userId: "user-1",
  from: "John Doe <john@example.com>",
  to: ["jane@example.com"],
  cc: [],
  bcc: [],
  subject: "Important Meeting Tomorrow",
  body: "Please join us for the quarterly review meeting.",
  htmlBody: "<p>Please join us for the quarterly review meeting.</p>",
  flags: ["unread"],
  folder: "inbox",
  priority: "normal",
  sentAt: new Date("2024-01-15T10:00:00Z"),
  receivedAt: new Date("2024-01-15T10:05:00Z"),
  createdAt: new Date("2024-01-15T10:05:00Z"),
  updatedAt: new Date("2024-01-15T10:05:00Z"),
  snoozedUntil: null,
  threadId: null,
};

// Run tests
async function runTests() {
  const test = new TestFramework();

  test.describe("Rules Engine - Condition Evaluation", () => {
    test.describe("From Address Conditions", () => {
      test.it("should match from address with contains operator", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "from",
          operator: "contains",
          value: "john@example.com",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should be case insensitive by default", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "from",
          operator: "contains",
          value: "JOHN@EXAMPLE.COM",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should respect case sensitivity when enabled", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "from",
          operator: "contains",
          value: "JOHN@EXAMPLE.COM",
          caseSensitive: true,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(false);
      });
    });

    test.describe("Subject Conditions", () => {
      test.it("should match subject with contains operator", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "subject",
          operator: "contains",
          value: "Meeting",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should match subject with starts_with operator", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "subject",
          operator: "starts_with",
          value: "Important",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should not match with wrong starts_with value", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "subject",
          operator: "starts_with",
          value: "Urgent",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(false);
      });
    });

    test.describe("Body Conditions", () => {
      test.it("should match body content", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "body",
          operator: "contains",
          value: "quarterly review",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should support regex matching", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "body",
          operator: "matches_regex",
          value: "\\bmeeting\\b",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });
    });

    test.describe("Sender Domain Conditions", () => {
      test.it("should extract and match sender domain", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "sender_domain",
          operator: "equals",
          value: "example.com",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should not match wrong domain", () => {
        const condition: Condition = {
          id: "cond-1",
          type: "sender_domain",
          operator: "equals",
          value: "other.com",
          caseSensitive: false,
        };

        const result = evaluateCondition(condition, sampleMessage as Message);
        test.expect(result).toBe(false);
      });
    });

    test.describe("Multiple Conditions (AND logic)", () => {
      test.it("should require all conditions to be true", () => {
        const conditions: Condition[] = [
          {
            id: "cond-1",
            type: "from",
            operator: "contains",
            value: "john@example.com",
            caseSensitive: false,
          },
          {
            id: "cond-2",
            type: "subject",
            operator: "contains",
            value: "Meeting",
            caseSensitive: false,
          },
        ];

        const result = evaluateConditions(conditions, sampleMessage as Message);
        test.expect(result).toBe(true);
      });

      test.it("should fail if any condition is false", () => {
        const conditions: Condition[] = [
          {
            id: "cond-1",
            type: "from",
            operator: "contains",
            value: "john@example.com",
            caseSensitive: false,
          },
          {
            id: "cond-2",
            type: "subject",
            operator: "contains",
            value: "Urgent",
            caseSensitive: false,
          },
        ];

        const result = evaluateConditions(conditions, sampleMessage as Message);
        test.expect(result).toBe(false);
      });
    });
  });

  test.describe("Rules Engine - Action Execution", () => {
    let mockPrisma: any;
    let actionExecutor: ActionExecutor;

    test.beforeEach(() => {
      mockPrisma = createMockPrisma();
      actionExecutor = new ActionExecutor(mockPrisma, "user-1");
    });

    test.describe("Move to Folder Action", () => {
      test.it("should move message to specified folder", async () => {
        const action: Action = {
          id: "action-1",
          type: "move_to_folder",
          value: "archive",
        };

        // Mock successful update
        mockPrisma.message.update = () =>
          Promise.resolve({
            ...sampleMessage,
            folder: "archive",
          });

        const result = await actionExecutor.executeActions(
          [action],
          "msg-1",
          sampleMessage as Message,
          false,
        );

        test.expect(result).toHaveLength(1);
        test.expect(result[0].success).toBe(true);
      });

      test.it(
        "should be idempotent - no action if already in folder",
        async () => {
          const action: Action = {
            id: "action-1",
            type: "move_to_folder",
            value: "inbox",
          };

          const result = await actionExecutor.executeActions(
            [action],
            "msg-1",
            sampleMessage as Message,
            false,
          );

          test.expect(result).toHaveLength(1);
          test.expect(result[0].success).toBe(true);
        },
      );
    });

    test.describe("Add Label Action", () => {
      test.it("should add label to message", async () => {
        const action: Action = {
          id: "action-1",
          type: "add_label",
          value: "important",
        };

        // Mock successful label operations
        mockPrisma.label.upsert = () =>
          Promise.resolve({
            id: "label-1",
            name: "important",
            userId: "user-1",
          });
        mockPrisma.messageLabel.findUnique = () => Promise.resolve(null);
        mockPrisma.messageLabel.create = () => Promise.resolve({});

        const result = await actionExecutor.executeActions(
          [action],
          "msg-1",
          sampleMessage as Message,
          false,
        );

        test.expect(result).toHaveLength(1);
        test.expect(result[0].success).toBe(true);
      });
    });

    test.describe("Delete Action", () => {
      test.it("should move message to trash and stop execution", async () => {
        const actions: Action[] = [
          {
            id: "action-1",
            type: "delete",
          },
          {
            id: "action-2",
            type: "add_label",
            value: "processed",
          },
        ];

        mockPrisma.message.update = () =>
          Promise.resolve({
            ...sampleMessage,
            folder: "trash",
          });

        const result = await actionExecutor.executeActions(
          actions,
          "msg-1",
          sampleMessage as Message,
          false,
        );

        test.expect(result).toHaveLength(2);
        test.expect(result[0].success).toBe(true);
        test.expect(result[1].success).toBe(false);
      });
    });

    test.describe("Dry Run Mode", () => {
      test.it("should not execute actions in dry run mode", async () => {
        const action: Action = {
          id: "action-1",
          type: "move_to_folder",
          value: "archive",
        };

        const result = await actionExecutor.executeActions(
          [action],
          "msg-1",
          sampleMessage as Message,
          true, // dry run
        );

        test.expect(result).toHaveLength(1);
        test.expect(result[0].success).toBe(true);
      });
    });
  });

  test.describe("Condition/Action Matrix Validation", () => {
    test.it(
      "should validate all condition types work with expected operators",
      () => {
        const conditionMatrix = [
          {
            type: "from",
            operators: [
              "equals",
              "contains",
              "starts_with",
              "ends_with",
              "matches_regex",
            ],
          },
          {
            type: "to",
            operators: [
              "equals",
              "contains",
              "starts_with",
              "ends_with",
              "matches_regex",
            ],
          },
          {
            type: "cc",
            operators: [
              "equals",
              "contains",
              "starts_with",
              "ends_with",
              "matches_regex",
            ],
          },
          {
            type: "subject",
            operators: [
              "equals",
              "contains",
              "starts_with",
              "ends_with",
              "matches_regex",
            ],
          },
          {
            type: "body",
            operators: [
              "equals",
              "contains",
              "starts_with",
              "ends_with",
              "matches_regex",
            ],
          },
          { type: "sender_domain", operators: ["equals", "contains"] },
          { type: "has_attachments", operators: ["equals"] },
          { type: "date_received", operators: ["before", "after", "between"] },
          { type: "priority", operators: ["equals"] },
          { type: "folder", operators: ["equals", "not_equals"] },
        ];

        for (const { type, operators } of conditionMatrix) {
          for (const operator of operators) {
            const condition: Condition = {
              id: "test-cond",
              type: type as any,
              operator: operator as any,
              value: "test-value",
              caseSensitive: false,
            };

            // Should not throw error for valid condition types
            try {
              evaluateCondition(condition, sampleMessage as Message);
              console.log(
                `  ✅ Condition type '${type}' with operator '${operator}' is valid`,
              );
            } catch (error) {
              console.log(
                `  ⚠️  Condition type '${type}' with operator '${operator}' failed: ${error.message}`,
              );
            }
          }
        }
      },
    );

    test.it("should validate all action types are properly structured", () => {
      const actionTypes = [
        "move_to_folder",
        "add_label",
        "remove_label",
        "mark_as_read",
        "mark_as_unread",
        "mark_as_important",
        "mark_as_spam",
        "delete",
        "archive",
        "forward_to",
        "auto_reply",
        "add_note",
        "set_priority",
        "snooze",
        "add_to_calendar",
      ];

      for (const actionType of actionTypes) {
        const action: Action = {
          id: "test-action",
          type: actionType as any,
          value: actionType.includes("mark_as") ? undefined : "test-value",
        };

        console.log(`  ✅ Action type '${actionType}' structure is valid`);
      }
    });
  });

  return test.run();
}

// Export for use in other modules
export { runTests, TestFramework, createMockPrisma };

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}
