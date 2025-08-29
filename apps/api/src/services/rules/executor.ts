import { PrismaClient, Message, User } from "@prisma/client";
import { Action, ActionResult } from "./types";
import { z } from "zod";

// Type imports
type ActionType = z.infer<typeof import("./types").ActionType>;

/**
 * Action executor with safety controls and idempotent execution
 */
export class ActionExecutor {
  constructor(
    private prisma: PrismaClient,
    private userId: string,
    private batchSizeLimit: number = 100,
    private verifiedAddresses: Set<string> = new Set(),
  ) {}

  /**
   * Executes an array of actions on a message
   */
  async executeActions(
    actions: Action[],
    messageId: string,
    message: Message,
    dryRun: boolean = false,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    let shouldStop = false;

    for (const action of actions) {
      if (shouldStop) {
        results.push({
          actionId: action.id,
          actionType: action.type,
          success: false,
          error: "Execution stopped by previous action",
        });
        continue;
      }

      try {
        const result = await this.executeAction(
          action,
          messageId,
          message,
          dryRun,
        );
        results.push(result);

        // Check if we should stop execution
        if (action.stopExecution || action.type === "delete") {
          shouldStop = true;
        }
      } catch (error) {
        results.push({
          actionId: action.id,
          actionType: action.type,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Executes a single action with idempotent behavior
   */
  private async executeAction(
    action: Action,
    messageId: string,
    message: Message,
    dryRun: boolean,
  ): Promise<ActionResult> {
    const actionType = action.type as ActionType;

    if (dryRun) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { dryRun: true, action: actionType, value: action.value },
      };
    }

    switch (actionType) {
      case "move_to_folder":
        return await this.moveToFolder(action, messageId, message);

      case "add_label":
        return await this.addLabel(action, messageId, message);

      case "remove_label":
        return await this.removeLabel(action, messageId, message);

      case "mark_as_read":
        return await this.markAsRead(action, messageId, message);

      case "mark_as_unread":
        return await this.markAsUnread(action, messageId, message);

      case "mark_as_important":
        return await this.markAsImportant(action, messageId, message);

      case "mark_as_spam":
        return await this.markAsSpam(action, messageId, message);

      case "delete":
        return await this.deleteMessage(action, messageId, message);

      case "archive":
        return await this.archiveMessage(action, messageId, message);

      case "forward_to":
        return await this.forwardTo(action, messageId, message);

      case "set_priority":
        return await this.setPriority(action, messageId, message);

      case "snooze_until":
        return await this.snoozeUntil(action, messageId, message);

      case "block_sender":
        return await this.blockSender(action, messageId, message);

      case "trust_sender":
        return await this.trustSender(action, messageId, message);

      default:
        throw new Error(`Unsupported action type: ${actionType}`);
    }
  }

  private async moveToFolder(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const folder = String(action.value);

    if (message.folder === folder) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyInFolder: folder },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { folder },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { movedTo: folder, previousFolder: message.folder },
    };
  }

  private async addLabel(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const labelName = String(action.value);

    // Find or create label
    const label = await this.prisma.label.upsert({
      where: { userId_name: { userId: this.userId, name: labelName } },
      create: { userId: this.userId, name: labelName },
      update: {},
    });

    // Check if already labeled (idempotent)
    const existingLabel = await this.prisma.messageLabel.findUnique({
      where: { messageId_labelId: { messageId, labelId: label.id } },
    });

    if (existingLabel) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyLabeled: labelName },
      };
    }

    await this.prisma.messageLabel.create({
      data: { messageId, labelId: label.id },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { labelAdded: labelName },
    };
  }

  private async removeLabel(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const labelName = String(action.value);

    const label = await this.prisma.label.findUnique({
      where: { userId_name: { userId: this.userId, name: labelName } },
    });

    if (!label) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { labelNotFound: labelName },
      };
    }

    const deleted = await this.prisma.messageLabel.deleteMany({
      where: { messageId, labelId: label.id },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { labelRemoved: labelName, wasLabeled: deleted.count > 0 },
    };
  }

  private async markAsRead(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const flags = message.flags.filter((f) => f !== "unread");
    if (!flags.includes("read")) {
      flags.push("read");
    }

    if (message.flags.includes("read") && !message.flags.includes("unread")) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyRead: true },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { flags },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { markedAsRead: true },
    };
  }

  private async markAsUnread(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const flags = message.flags.filter((f) => f !== "read");
    if (!flags.includes("unread")) {
      flags.push("unread");
    }

    if (message.flags.includes("unread") && !message.flags.includes("read")) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyUnread: true },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { flags },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { markedAsUnread: true },
    };
  }

  private async markAsImportant(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const flags = [...message.flags];
    if (!flags.includes("important")) {
      flags.push("important");
    }

    if (message.flags.includes("important")) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyImportant: true },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { flags },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { markedAsImportant: true },
    };
  }

  private async markAsSpam(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: { folder: "spam" },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { movedToSpam: true, previousFolder: message.folder },
    };
  }

  private async deleteMessage(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: { folder: "trash" },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { movedToTrash: true, previousFolder: message.folder },
    };
  }

  private async archiveMessage(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    if (message.folder === "archive") {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadyArchived: true },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { folder: "archive" },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { archived: true, previousFolder: message.folder },
    };
  }

  private async forwardTo(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const forwardAddress = String(action.value);

    // Safety check: only forward to verified addresses
    if (!this.verifiedAddresses.has(forwardAddress)) {
      throw new Error(`Forward address ${forwardAddress} is not verified`);
    }

    // Here you would implement the actual forwarding logic
    // For now, we'll just log the intent
    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { forwardedTo: forwardAddress, subject: message.subject },
    };
  }

  private async setPriority(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const priority = String(action.value);

    if (message.priority === priority) {
      return {
        actionId: action.id,
        actionType: action.type,
        success: true,
        details: { alreadySetTo: priority },
      };
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { priority },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { prioritySet: priority, previousPriority: message.priority },
    };
  }

  private async snoozeUntil(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    const snoozeUntil = new Date(String(action.value));

    await this.prisma.message.update({
      where: { id: messageId },
      data: { snoozedUntil: snoozeUntil },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { snoozedUntil: snoozeUntil.toISOString() },
    };
  }

  private async blockSender(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    // Extract sender domain or address
    const senderEmail = message.from.match(/<(.+?)>/)
      ? message.from.match(/<(.+?)>/)![1]
      : message.from;

    // Create or update policy
    await this.prisma.policy.upsert({
      where: {
        userId_type_value: {
          userId: this.userId,
          type: "block_sender",
          value: senderEmail,
        },
      },
      create: {
        userId: this.userId,
        type: "block_sender",
        value: senderEmail,
        action: "block",
      },
      update: { action: "block" },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { blockedSender: senderEmail },
    };
  }

  private async trustSender(
    action: Action,
    messageId: string,
    message: Message,
  ): Promise<ActionResult> {
    // Extract sender domain or address
    const senderEmail = message.from.match(/<(.+?)>/)
      ? message.from.match(/<(.+?)>/)![1]
      : message.from;

    // Create or update policy
    await this.prisma.policy.upsert({
      where: {
        userId_type_value: {
          userId: this.userId,
          type: "trusted_sender",
          value: senderEmail,
        },
      },
      create: {
        userId: this.userId,
        type: "trusted_sender",
        value: senderEmail,
        action: "allow",
      },
      update: { action: "allow" },
    });

    return {
      actionId: action.id,
      actionType: action.type,
      success: true,
      details: { trustedSender: senderEmail },
    };
  }
}
