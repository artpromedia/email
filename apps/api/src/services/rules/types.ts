import { z } from "zod";

// Condition types and schemas
export const ConditionType = z.enum([
  "from",
  "to",
  "cc",
  "subject",
  "body",
  "has_attachment",
  "attachment_name",
  "sender_domain",
  "size_greater_than",
  "size_less_than",
  "date_after",
  "date_before",
  "priority",
  "has_label",
  "folder",
]);

export const ConditionOperator = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than",
  "in_list",
  "not_in_list",
]);

export const ConditionSchema = z.object({
  id: z.string(),
  type: ConditionType,
  operator: ConditionOperator,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  caseSensitive: z.boolean().default(false),
});

// Action types and schemas
export const ActionType = z.enum([
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
  "reply_with_template",
  "set_priority",
  "snooze_until",
  "block_sender",
  "trust_sender",
]);

export const ActionSchema = z.object({
  id: z.string(),
  type: ActionType,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  stopExecution: z.boolean().default(false), // Stop processing further rules
});

// Rule schema
export const RuleSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  conditions: z.array(ConditionSchema).min(1),
  actions: z.array(ActionSchema).min(1),
  triggers: z
    .array(z.enum(["on-receive", "on-send", "manual"]))
    .default(["on-receive"]),
});

// Execution context
export interface ExecutionContext {
  trigger: "on-receive" | "on-send" | "manual";
  userId: string;
  messageId?: string;
  batchSize?: number;
  dryRun?: boolean;
}

// Execution result
export interface ExecutionResult {
  ruleId: string;
  status: "success" | "failure" | "skipped";
  executionTimeMs: number;
  actionsApplied: ActionResult[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface ActionResult {
  actionId: string;
  actionType: string;
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

// Batch execution result
export interface BatchExecutionResult {
  jobId: string;
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: ExecutionResult[];
  errors: string[];
}

export type Condition = z.infer<typeof ConditionSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Rule = z.infer<typeof RuleSchema>;
