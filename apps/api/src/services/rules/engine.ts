import { PrismaClient, Message } from "@prisma/client";
import {
  Rule,
  ExecutionContext,
  ExecutionResult,
  BatchExecutionResult,
  Condition,
  Action,
} from "./types";
import { evaluateConditions } from "./matcher";
import { ActionExecutor } from "./executor";
import { RuleMetrics } from "./metrics";
import { getTelemetry } from "@ceerion/observability";
import { randomUUID } from "crypto";

/**
 * Deterministic, observable rules engine with safety controls
 */
export class RulesEngine {
  private metrics: RuleMetrics;
  private telemetry = getTelemetry();

  constructor(
    private prisma: PrismaClient,
    private batchSizeLimit: number = 100,
    private speedLimitMs: number = 100, // Min time between batch items
  ) {
    this.metrics = new RuleMetrics();
  }

  /**
   * Execute rules for a single message
   */
  async executeRules(
    messageId: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult[]> {
    const startTime = Date.now();

    try {
      // Get message with related data
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: {
          messageLabels: { include: { label: true } },
          attachments: true,
        },
      });

      if (!message || message.userId !== context.userId) {
        throw new Error("Message not found or access denied");
      }

      // Get active rules for user, ordered by priority
      const rules = await this.prisma.rule.findMany({
        where: {
          userId: context.userId,
          isEnabled: true,
          triggers: { has: context.trigger },
        },
        orderBy: { priority: "desc" },
      });

      const results: ExecutionResult[] = [];
      let shouldStopExecution = false;

      for (const rule of rules) {
        if (shouldStopExecution) {
          results.push({
            ruleId: rule.id,
            status: "skipped",
            executionTimeMs: 0,
            actionsApplied: [],
            metadata: { reason: "stopped_by_previous_rule" },
          });
          continue;
        }

        const ruleStartTime = Date.now();

        try {
          // Parse rule conditions and actions
          const conditions = Array.isArray(rule.conditions)
            ? (rule.conditions as Condition[])
            : [];
          const actions = Array.isArray(rule.actions)
            ? (rule.actions as Action[])
            : [];

          // Evaluate conditions
          const conditionsMatch = evaluateConditions(conditions, message);

          if (!conditionsMatch) {
            results.push({
              ruleId: rule.id,
              status: "skipped",
              executionTimeMs: Date.now() - ruleStartTime,
              actionsApplied: [],
              metadata: { reason: "conditions_not_met" },
            });
            continue;
          }

          // Execute actions
          const executor = new ActionExecutor(
            this.prisma,
            context.userId,
            this.batchSizeLimit,
          );

          const actionResults = await executor.executeActions(
            actions,
            messageId,
            message,
            context.dryRun || false,
          );

          const executionTimeMs = Date.now() - ruleStartTime;
          const hasFailures = actionResults.some((r) => !r.success);

          const result: ExecutionResult = {
            ruleId: rule.id,
            status: hasFailures ? "failure" : "success",
            executionTimeMs,
            actionsApplied: actionResults,
          };

          results.push(result);

          // Record execution metrics and audit
          await this.recordExecution(rule, message, context, result);
          this.metrics.recordRuleExecution(
            rule.id,
            executionTimeMs,
            !hasFailures,
          );

          // Check if any action requested stopping execution
          const hasStopAction =
            actions.some((a: any) => a.stopExecution) ||
            actionResults.some((r) => r.actionType === "delete");

          if (hasStopAction) {
            shouldStopExecution = true;
          }
        } catch (error) {
          const executionTimeMs = Date.now() - ruleStartTime;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          const result: ExecutionResult = {
            ruleId: rule.id,
            status: "failure",
            executionTimeMs,
            actionsApplied: [],
            error: errorMessage,
          };

          results.push(result);

          // Record failed execution
          await this.recordExecution(rule, message, context, result);
          this.metrics.recordRuleExecution(rule.id, executionTimeMs, false);

          // Log error but continue with other rules
          console.error(`Rule execution failed for rule ${rule.id}:`, error);
        }
      }

      const totalTime = Date.now() - startTime;
      this.metrics.recordBatchExecution(results.length, totalTime);

      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Rules engine execution failed:", error);
      throw new Error(`Rules execution failed: ${errorMessage}`);
    }
  }

  /**
   * Run rules on existing mail (batch processing)
   */
  async runOnExistingMail(
    userId: string,
    options: {
      folder?: string;
      labelId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<string> {
    // Create job record
    const jobId = randomUUID();
    const job = await this.prisma.ruleJobQueue.create({
      data: {
        id: jobId,
        userId,
        jobType: "run-on-existing",
        status: "pending",
        parameters: options,
      },
    });

    // Process job asynchronously
    this.processExistingMailJob(jobId, userId, options).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
      this.prisma.ruleJobQueue
        .update({
          where: { id: jobId },
          data: {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          },
        })
        .catch(console.error);
    });

    return jobId;
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string, userId: string) {
    return await this.prisma.ruleJobQueue.findFirst({
      where: { id: jobId, userId },
    });
  }

  /**
   * Process existing mail job
   */
  private async processExistingMailJob(
    jobId: string,
    userId: string,
    options: any,
  ): Promise<void> {
    try {
      // Update job status to running
      await this.prisma.ruleJobQueue.update({
        where: { id: jobId },
        data: { status: "running", startedAt: new Date() },
      });

      // Build message query
      const where: any = { userId };
      if (options.folder) where.folder = options.folder;
      if (options.dateFrom) where.receivedAt = { gte: options.dateFrom };
      if (options.dateTo)
        where.receivedAt = { ...where.receivedAt, lte: options.dateTo };

      // Get total count
      const totalItems = await this.prisma.message.count({ where });

      await this.prisma.ruleJobQueue.update({
        where: { id: jobId },
        data: { totalItems },
      });

      // Process in batches
      const batchSize = Math.min(this.batchSizeLimit, options.limit || 1000);
      let processed = 0;
      let failed = 0;
      const results: ExecutionResult[] = [];

      let skip = 0;
      while (
        processed < totalItems &&
        (options.limit ? processed < options.limit : true)
      ) {
        const messages = await this.prisma.message.findMany({
          where,
          skip,
          take: batchSize,
          orderBy: { createdAt: "desc" },
        });

        if (messages.length === 0) break;

        for (const message of messages) {
          try {
            const context: ExecutionContext = {
              trigger: "manual",
              userId,
              messageId: message.id,
              dryRun: options.dryRun,
            };

            const messageResults = await this.executeRules(message.id, context);
            results.push(...messageResults);
            processed++;

            // Rate limiting
            if (this.speedLimitMs > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, this.speedLimitMs),
              );
            }
          } catch (error) {
            failed++;
            console.error(`Failed to process message ${message.id}:`, error);
          }

          // Update progress
          const progress = Math.floor((processed / totalItems) * 100);
          await this.prisma.ruleJobQueue.update({
            where: { id: jobId },
            data: {
              progress,
              processedItems: processed,
              failedItems: failed,
            },
          });
        }

        skip += batchSize;
      }

      // Complete job
      await this.prisma.ruleJobQueue.update({
        where: { id: jobId },
        data: {
          status: "completed",
          progress: 100,
          processedItems: processed,
          failedItems: failed,
          result: {
            summary: {
              totalProcessed: processed,
              successful: processed - failed,
              failed,
              rulesExecuted: results.length,
            },
          },
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.ruleJobQueue.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Record rule execution for audit and metrics
   */
  private async recordExecution(
    rule: any,
    message: Message,
    context: ExecutionContext,
    result: ExecutionResult,
  ): Promise<void> {
    try {
      // Record execution metrics
      await this.prisma.ruleExecution.create({
        data: {
          ruleId: rule.id,
          messageId: message.id,
          userId: context.userId,
          trigger: context.trigger,
          status: result.status,
          executionTimeMs: result.executionTimeMs,
          actionsApplied: JSON.stringify(result.actionsApplied),
          error: result.error,
          metadata: result.metadata,
        },
      });

      // Record audit log
      await this.prisma.ruleAuditLog.create({
        data: {
          ruleId: rule.id,
          messageId: message.id,
          userId: context.userId,
          action: "executed",
          outcome: {
            status: result.status,
            actionsApplied: result.actionsApplied.length,
            executionTimeMs: result.executionTimeMs,
          },
        },
      });
    } catch (error) {
      console.error("Failed to record rule execution:", error);
      // Don't throw - this shouldn't stop rule execution
    }
  }

  /**
   * Get rule execution metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Clean up old execution records (for maintenance)
   */
  async cleanupOldRecords(olderThanDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    await this.prisma.ruleExecution.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    await this.prisma.ruleAuditLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
  }
}
