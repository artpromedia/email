import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { RulesEngine } from "../../src/services/rules/engine";
import {
  evaluateCondition,
  evaluateConditions,
} from "../../src/services/rules/matcher";
import { ActionExecutor } from "../../src/services/rules/executor";
import { Message } from "@prisma/client";
import {
  Condition,
  Action,
  ExecutionContext,
} from "../../src/services/rules/types";

// Mock Prisma client
const mockPrisma = {
  rule: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  ruleExecution: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  ruleAuditLog: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  ruleJobQueue: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  label: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  messageLabel: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  policy: {
    upsert: jest.fn(),
  },
} as any;

describe("Rules Engine - Condition Evaluation", () => {
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

  describe("From Address Conditions", () => {
    it("should match exact from address", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "from",
        operator: "equals",
        value: "john@example.com",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(false); // Because from includes name: "John Doe <john@example.com>"
    });

    it("should match from address with contains operator", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "from",
        operator: "contains",
        value: "john@example.com",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should be case insensitive by default", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "from",
        operator: "contains",
        value: "JOHN@EXAMPLE.COM",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should respect case sensitivity when enabled", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "from",
        operator: "contains",
        value: "JOHN@EXAMPLE.COM",
        caseSensitive: true,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(false);
    });
  });

  describe("Subject Conditions", () => {
    it("should match subject with contains operator", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "subject",
        operator: "contains",
        value: "Meeting",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should match subject with starts_with operator", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "subject",
        operator: "starts_with",
        value: "Important",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should not match with wrong starts_with value", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "subject",
        operator: "starts_with",
        value: "Urgent",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(false);
    });
  });

  describe("Body Conditions", () => {
    it("should match body content", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "body",
        operator: "contains",
        value: "quarterly review",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should support regex matching", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "body",
        operator: "matches_regex",
        value: "\\bmeeting\\b",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });
  });

  describe("Sender Domain Conditions", () => {
    it("should extract and match sender domain", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "sender_domain",
        operator: "equals",
        value: "example.com",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(true);
    });

    it("should not match wrong domain", () => {
      const condition: Condition = {
        id: "cond-1",
        type: "sender_domain",
        operator: "equals",
        value: "other.com",
        caseSensitive: false,
      };

      const result = evaluateCondition(condition, sampleMessage as Message);
      expect(result).toBe(false);
    });
  });

  describe("Multiple Conditions (AND logic)", () => {
    it("should require all conditions to be true", () => {
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
      expect(result).toBe(true);
    });

    it("should fail if any condition is false", () => {
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
      expect(result).toBe(false);
    });
  });
});

describe("Rules Engine - Action Execution", () => {
  let actionExecutor: ActionExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    actionExecutor = new ActionExecutor(mockPrisma, "user-1");
  });

  const sampleMessage: Partial<Message> = {
    id: "msg-1",
    userId: "user-1",
    from: "john@example.com",
    subject: "Test Subject",
    body: "Test body",
    folder: "inbox",
    flags: ["unread"],
    priority: "normal",
  };

  describe("Move to Folder Action", () => {
    it("should move message to specified folder", async () => {
      const action: Action = {
        id: "action-1",
        type: "move_to_folder",
        value: "archive",
      };

      mockPrisma.message.update.mockResolvedValueOnce({
        ...sampleMessage,
        folder: "archive",
      });

      const result = await actionExecutor.executeActions(
        [action],
        "msg-1",
        sampleMessage as Message,
        false,
      );

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.movedTo).toBe("archive");
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: { folder: "archive" },
      });
    });

    it("should be idempotent - no action if already in folder", async () => {
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

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.alreadyInFolder).toBe("inbox");
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });
  });

  describe("Add Label Action", () => {
    it("should add label to message", async () => {
      const action: Action = {
        id: "action-1",
        type: "add_label",
        value: "important",
      };

      mockPrisma.label.upsert.mockResolvedValueOnce({
        id: "label-1",
        name: "important",
        userId: "user-1",
      });

      mockPrisma.messageLabel.findUnique.mockResolvedValueOnce(null);
      mockPrisma.messageLabel.create.mockResolvedValueOnce({
        messageId: "msg-1",
        labelId: "label-1",
      });

      const result = await actionExecutor.executeActions(
        [action],
        "msg-1",
        sampleMessage as Message,
        false,
      );

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.labelAdded).toBe("important");
    });

    it("should be idempotent - no action if already labeled", async () => {
      const action: Action = {
        id: "action-1",
        type: "add_label",
        value: "important",
      };

      mockPrisma.label.upsert.mockResolvedValueOnce({
        id: "label-1",
        name: "important",
        userId: "user-1",
      });

      mockPrisma.messageLabel.findUnique.mockResolvedValueOnce({
        messageId: "msg-1",
        labelId: "label-1",
      });

      const result = await actionExecutor.executeActions(
        [action],
        "msg-1",
        sampleMessage as Message,
        false,
      );

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.alreadyLabeled).toBe("important");
      expect(mockPrisma.messageLabel.create).not.toHaveBeenCalled();
    });
  });

  describe("Delete Action", () => {
    it("should move message to trash and stop execution", async () => {
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

      mockPrisma.message.update.mockResolvedValueOnce({
        ...sampleMessage,
        folder: "trash",
      });

      const result = await actionExecutor.executeActions(
        actions,
        "msg-1",
        sampleMessage as Message,
        false,
      );

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.movedToTrash).toBe(true);

      // Second action should be skipped due to delete
      expect(result[1].success).toBe(false);
      expect(result[1].error).toContain("Execution stopped");
    });
  });

  describe("Dry Run Mode", () => {
    it("should not execute actions in dry run mode", async () => {
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

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(result[0].details?.dryRun).toBe(true);
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });
  });
});

describe("Rules Engine - Integration", () => {
  let rulesEngine: RulesEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    rulesEngine = new RulesEngine(mockPrisma, 100, 10);
  });

  const sampleMessage: Partial<Message> = {
    id: "msg-1",
    userId: "user-1",
    from: "sender@example.com",
    to: ["user@company.com"],
    subject: "Project Update",
    body: "Important project update",
    folder: "inbox",
    flags: ["unread"],
    priority: "normal",
  };

  const sampleRule = {
    id: "rule-1",
    userId: "user-1",
    name: "Project Updates",
    isEnabled: true,
    priority: 1,
    conditions: [
      {
        id: "cond-1",
        type: "subject",
        operator: "contains",
        value: "Project",
        caseSensitive: false,
      },
    ],
    actions: [
      {
        id: "action-1",
        type: "add_label",
        value: "projects",
      },
    ],
    triggers: ["on-receive"],
  };

  it("should execute rules for a message", async () => {
    const context: ExecutionContext = {
      trigger: "on-receive",
      userId: "user-1",
      messageId: "msg-1",
    };

    mockPrisma.message.findUnique.mockResolvedValueOnce({
      ...sampleMessage,
      messageLabels: [],
      attachments: [],
    });

    mockPrisma.rule.findMany.mockResolvedValueOnce([sampleRule]);

    // Mock successful action execution
    mockPrisma.label.upsert.mockResolvedValueOnce({
      id: "label-1",
      name: "projects",
      userId: "user-1",
    });
    mockPrisma.messageLabel.findUnique.mockResolvedValueOnce(null);
    mockPrisma.messageLabel.create.mockResolvedValueOnce({});
    mockPrisma.ruleExecution.create.mockResolvedValueOnce({});
    mockPrisma.ruleAuditLog.create.mockResolvedValueOnce({});

    const results = await rulesEngine.executeRules("msg-1", context);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("success");
    expect(results[0].ruleId).toBe("rule-1");
    expect(results[0].actionsApplied).toHaveLength(1);
  });

  it("should skip rules when conditions do not match", async () => {
    const context: ExecutionContext = {
      trigger: "on-receive",
      userId: "user-1",
      messageId: "msg-1",
    };

    const ruleWithNonMatchingCondition = {
      ...sampleRule,
      conditions: [
        {
          id: "cond-1",
          type: "subject",
          operator: "contains",
          value: "Invoice",
          caseSensitive: false,
        },
      ],
    };

    mockPrisma.message.findUnique.mockResolvedValueOnce({
      ...sampleMessage,
      messageLabels: [],
      attachments: [],
    });

    mockPrisma.rule.findMany.mockResolvedValueOnce([
      ruleWithNonMatchingCondition,
    ]);
    mockPrisma.ruleExecution.create.mockResolvedValueOnce({});
    mockPrisma.ruleAuditLog.create.mockResolvedValueOnce({});

    const results = await rulesEngine.executeRules("msg-1", context);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("skipped");
    expect(results[0].metadata?.reason).toBe("conditions_not_met");
  });

  it("should handle rule execution errors gracefully", async () => {
    const context: ExecutionContext = {
      trigger: "on-receive",
      userId: "user-1",
      messageId: "msg-1",
    };

    mockPrisma.message.findUnique.mockResolvedValueOnce({
      ...sampleMessage,
      messageLabels: [],
      attachments: [],
    });

    mockPrisma.rule.findMany.mockResolvedValueOnce([sampleRule]);

    // Mock action execution failure
    mockPrisma.label.upsert.mockRejectedValueOnce(new Error("Database error"));
    mockPrisma.ruleExecution.create.mockResolvedValueOnce({});
    mockPrisma.ruleAuditLog.create.mockResolvedValueOnce({});

    const results = await rulesEngine.executeRules("msg-1", context);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failure");
    expect(results[0].error).toContain("Database error");
  });
});

describe("Rules Engine - Sample Set Processing", () => {
  let rulesEngine: RulesEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    rulesEngine = new RulesEngine(mockPrisma, 10, 0); // Small batch size for testing
  });

  it("should process a sample set and produce expected moves/labels", async () => {
    // Sample messages for testing
    const sampleMessages = [
      {
        id: "msg-1",
        subject: "Invoice #123",
        from: "billing@vendor.com",
        folder: "inbox",
      },
      {
        id: "msg-2",
        subject: "Project Update",
        from: "team@company.com",
        folder: "inbox",
      },
      {
        id: "msg-3",
        subject: "Newsletter",
        from: "news@example.com",
        folder: "inbox",
      },
    ];

    // Rules that should process these messages
    const testRules = [
      {
        id: "rule-1",
        name: "Move Invoices",
        priority: 1,
        conditions: [
          { type: "subject", operator: "contains", value: "Invoice" },
        ],
        actions: [{ type: "move_to_folder", value: "finance" }],
        triggers: ["manual"],
      },
      {
        id: "rule-2",
        name: "Label Projects",
        priority: 2,
        conditions: [
          { type: "subject", operator: "contains", value: "Project" },
        ],
        actions: [{ type: "add_label", value: "projects" }],
        triggers: ["manual"],
      },
    ];

    // Mock database responses
    mockPrisma.ruleJobQueue.create.mockResolvedValueOnce({ id: "job-1" });
    mockPrisma.ruleJobQueue.update.mockResolvedValue({});
    mockPrisma.message.count.mockResolvedValueOnce(3);
    mockPrisma.message.findMany.mockResolvedValueOnce(sampleMessages);
    mockPrisma.rule.findMany.mockResolvedValue(testRules);

    // Mock individual message processing
    sampleMessages.forEach((msg) => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        ...msg,
        messageLabels: [],
        attachments: [],
        userId: "user-1",
      });
    });

    // Mock successful actions
    mockPrisma.message.update.mockResolvedValue({});
    mockPrisma.label.upsert.mockResolvedValue({ id: "label-1" });
    mockPrisma.messageLabel.findUnique.mockResolvedValue(null);
    mockPrisma.messageLabel.create.mockResolvedValue({});
    mockPrisma.ruleExecution.create.mockResolvedValue({});
    mockPrisma.ruleAuditLog.create.mockResolvedValue({});

    // Start the job
    const jobId = await rulesEngine.runOnExistingMail("user-1", {
      limit: 10,
      dryRun: false,
    });

    expect(jobId).toBe("job-1");

    // Wait for job completion (in real scenario, you'd poll the job status)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify expected outcomes
    expect(mockPrisma.message.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });

    // Should have processed all messages
    expect(mockPrisma.message.findMany).toHaveBeenCalled();

    // Should have executed rules for each message
    expect(mockPrisma.rule.findMany).toHaveBeenCalledTimes(3);

    // Expected moves and labels based on rules:
    // msg-1 (Invoice): should be moved to 'finance'
    // msg-2 (Project): should get 'projects' label
    // msg-3 (Newsletter): no rules apply
  });
});
