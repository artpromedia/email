import { describe, it, expect, beforeEach, vi } from "vitest";
import { ActionExecutor } from "../../../src/services/rules/executor";
import { Action, ActionResult } from "../../../src/services/rules/types";
import { Message, PrismaClient } from "@prisma/client";

// Mock Prisma
const mockPrisma = {
  message: {
    update: vi.fn(),
  },
  label: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  messageLabel: {
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  policy: {
    upsert: vi.fn(),
  },
} as unknown as PrismaClient;

describe("ActionExecutor", () => {
  let executor: ActionExecutor;
  let sampleMessage: Message;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ActionExecutor(mockPrisma, "user1", 100);

    sampleMessage = {
      id: "msg1",
      messageId: "<test@example.com>",
      threadId: null,
      userId: "user1",
      from: "Alice <alice@example.com>",
      to: ["bob@example.com"],
      cc: [],
      bcc: [],
      subject: "Test Subject",
      body: "Test body content",
      htmlBody: null,
      flags: ["unread"],
      folder: "inbox",
      priority: "normal",
      sentAt: new Date("2024-01-15T10:00:00Z"),
      receivedAt: new Date("2024-01-15T10:05:00Z"),
      snoozedUntil: null,
      createdAt: new Date("2024-01-15T10:05:00Z"),
      updatedAt: new Date("2024-01-15T10:05:00Z"),
    };
  });

  describe("executeActions", () => {
    it("should execute actions in order", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "move_to_folder",
          value: "important",
        },
        {
          id: "action2",
          type: "add_label",
          value: "work",
        },
      ];

      mockPrisma.message.update = vi.fn().mockResolvedValue(sampleMessage);
      mockPrisma.label.upsert = vi
        .fn()
        .mockResolvedValue({ id: "label1", name: "work" });
      mockPrisma.messageLabel.findUnique = vi.fn().mockResolvedValue(null);
      mockPrisma.messageLabel.create = vi.fn().mockResolvedValue({});

      const results = await executor.executeActions(
        actions,
        "msg1",
        sampleMessage,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockPrisma.message.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.label.upsert).toHaveBeenCalledTimes(1);
    });

    it("should stop execution when stopExecution is true", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "move_to_folder",
          value: "important",
          stopExecution: true,
        },
        {
          id: "action2",
          type: "add_label",
          value: "work",
        },
      ];

      mockPrisma.message.update = vi.fn().mockResolvedValue(sampleMessage);

      const results = await executor.executeActions(
        actions,
        "msg1",
        sampleMessage,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("Execution stopped");
    });

    it("should stop execution after delete action", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "delete",
        },
        {
          id: "action2",
          type: "add_label",
          value: "work",
        },
      ];

      mockPrisma.message.update = vi.fn().mockResolvedValue(sampleMessage);

      const results = await executor.executeActions(
        actions,
        "msg1",
        sampleMessage,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("Execution stopped");
    });

    it("should handle action failures gracefully", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "move_to_folder",
          value: "important",
        },
      ];

      mockPrisma.message.update = vi
        .fn()
        .mockRejectedValue(new Error("Database error"));

      const results = await executor.executeActions(
        actions,
        "msg1",
        sampleMessage,
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe("Database error");
    });

    it("should support dry run mode", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "move_to_folder",
          value: "important",
        },
      ];

      const results = await executor.executeActions(
        actions,
        "msg1",
        sampleMessage,
        true,
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].details?.dryRun).toBe(true);
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });
  });

  describe("individual actions", () => {
    describe("move_to_folder", () => {
      it("should move message to different folder", async () => {
        const action: Action = {
          id: "action1",
          type: "move_to_folder",
          value: "important",
        };

        mockPrisma.message.update = vi.fn().mockResolvedValue({
          ...sampleMessage,
          folder: "important",
        });

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.movedTo).toBe("important");
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: "msg1" },
          data: { folder: "important" },
        });
      });

      it("should be idempotent - not move if already in folder", async () => {
        sampleMessage.folder = "important";
        const action: Action = {
          id: "action1",
          type: "move_to_folder",
          value: "important",
        };

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.alreadyInFolder).toBe("important");
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });
    });

    describe("add_label", () => {
      it("should add new label to message", async () => {
        const action: Action = {
          id: "action1",
          type: "add_label",
          value: "work",
        };

        mockPrisma.label.upsert = vi.fn().mockResolvedValue({
          id: "label1",
          name: "work",
          userId: "user1",
        });
        mockPrisma.messageLabel.findUnique = vi.fn().mockResolvedValue(null);
        mockPrisma.messageLabel.create = vi.fn().mockResolvedValue({});

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.labelAdded).toBe("work");
        expect(mockPrisma.label.upsert).toHaveBeenCalledWith({
          where: { userId_name: { userId: "user1", name: "work" } },
          create: { userId: "user1", name: "work" },
          update: {},
        });
      });

      it("should be idempotent - not add if already labeled", async () => {
        const action: Action = {
          id: "action1",
          type: "add_label",
          value: "work",
        };

        mockPrisma.label.upsert = vi.fn().mockResolvedValue({
          id: "label1",
          name: "work",
          userId: "user1",
        });
        mockPrisma.messageLabel.findUnique = vi.fn().mockResolvedValue({
          messageId: "msg1",
          labelId: "label1",
        });

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.alreadyLabeled).toBe("work");
        expect(mockPrisma.messageLabel.create).not.toHaveBeenCalled();
      });
    });

    describe("mark_as_read", () => {
      it("should mark unread message as read", async () => {
        const action: Action = {
          id: "action1",
          type: "mark_as_read",
        };

        mockPrisma.message.update = vi.fn().mockResolvedValue({
          ...sampleMessage,
          flags: ["read"],
        });

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.markedAsRead).toBe(true);
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: "msg1" },
          data: { flags: ["read"] },
        });
      });

      it("should be idempotent - not change if already read", async () => {
        sampleMessage.flags = ["read"];
        const action: Action = {
          id: "action1",
          type: "mark_as_read",
        };

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.alreadyRead).toBe(true);
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });
    });

    describe("delete", () => {
      it("should move message to trash", async () => {
        const action: Action = {
          id: "action1",
          type: "delete",
        };

        mockPrisma.message.update = vi.fn().mockResolvedValue({
          ...sampleMessage,
          folder: "trash",
        });

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.movedToTrash).toBe(true);
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: "msg1" },
          data: { folder: "trash" },
        });
      });
    });

    describe("block_sender", () => {
      it("should create block policy for sender", async () => {
        const action: Action = {
          id: "action1",
          type: "block_sender",
        };

        mockPrisma.policy.upsert = vi.fn().mockResolvedValue({});

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.blockedSender).toBe("alice@example.com");
        expect(mockPrisma.policy.upsert).toHaveBeenCalledWith({
          where: {
            userId_type_value: {
              userId: "user1",
              type: "block_sender",
              value: "alice@example.com",
            },
          },
          create: {
            userId: "user1",
            type: "block_sender",
            value: "alice@example.com",
            action: "block",
          },
          update: { action: "block" },
        });
      });
    });

    describe("set_priority", () => {
      it("should update message priority", async () => {
        const action: Action = {
          id: "action1",
          type: "set_priority",
          value: "high",
        };

        mockPrisma.message.update = vi.fn().mockResolvedValue({
          ...sampleMessage,
          priority: "high",
        });

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.prioritySet).toBe("high");
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: "msg1" },
          data: { priority: "high" },
        });
      });

      it("should be idempotent - not change if priority already set", async () => {
        sampleMessage.priority = "high";
        const action: Action = {
          id: "action1",
          type: "set_priority",
          value: "high",
        };

        const results = await executor.executeActions(
          [action],
          "msg1",
          sampleMessage,
        );

        expect(results[0].success).toBe(true);
        expect(results[0].details?.alreadySetTo).toBe("high");
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });
    });
  });
});
