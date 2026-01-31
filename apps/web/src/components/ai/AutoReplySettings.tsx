"use client";

/**
 * Auto-Reply Settings Component
 * Mode selector, rule builder, safeguards configuration, audit log
 */

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  Shield,
  FileText,
  ChevronRight,
  AlertCircle,
  Users,
  Mail,
  Tag,
  Calendar,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Eye,
  Send,
  MessageSquare,
} from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

type AutoReplyMode = "off" | "suggest" | "draft" | "auto_send";

interface AutoReplyRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  responseTemplate: string;
  safeguards: RuleSafeguards;
  stats?: {
    triggered: number;
    sent: number;
    lastTriggered?: string;
  };
}

interface RuleCondition {
  type: "sender" | "subject" | "keyword" | "label" | "time" | "out_of_office";
  operator: "contains" | "equals" | "starts_with" | "ends_with" | "regex" | "is" | "between";
  value: string;
  value2?: string; // For "between" operators
}

interface RuleSafeguards {
  excludeVip: boolean;
  excludeDomains: string[];
  maxRepliesPerSender: number;
  cooldownMinutes: number;
  workingHoursOnly: boolean;
  workingHours?: {
    start: string; // "09:00"
    end: string; // "17:00"
    timezone: string;
  };
  requireApproval: boolean;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  ruleId: string;
  ruleName: string;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  action: "suggested" | "drafted" | "sent" | "blocked" | "cooldown";
  responsePreview: string;
  blockedReason?: string;
}

// ============================================================
// MODE SELECTOR
// ============================================================

interface ModeToggleProps {
  currentMode: AutoReplyMode;
  onChange: (mode: AutoReplyMode) => void;
  disabled?: boolean;
}

export function AutoReplyModeToggle({
  currentMode,
  onChange,
  disabled,
}: Readonly<ModeToggleProps>) {
  const modes: {
    value: AutoReplyMode;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "off",
      label: "Off",
      description: "Auto-reply disabled",
      icon: <X className="h-4 w-4" />,
    },
    {
      value: "suggest",
      label: "Suggest",
      description: "Show suggestions in inbox",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      value: "draft",
      label: "Draft",
      description: "Create drafts for review",
      icon: <Eye className="h-4 w-4" />,
    },
    {
      value: "auto_send",
      label: "Auto Send",
      description: "Send automatically",
      icon: <Send className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-violet-500" />
        <span className="font-medium text-neutral-800 dark:text-neutral-200">Auto-Reply Mode</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => !disabled && onChange(mode.value)}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center rounded-lg border p-3 transition-all",
              currentMode === mode.value
                ? mode.value === "auto_send"
                  ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20 dark:bg-amber-900/20"
                  : "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20 dark:bg-violet-900/20"
                : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <div
              className={cn(
                "mb-2 rounded-full p-2",
                currentMode === mode.value
                  ? mode.value === "auto_send"
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-800/50"
                    : "bg-violet-100 text-violet-600 dark:bg-violet-800/50"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
              )}
            >
              {mode.icon}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                currentMode === mode.value
                  ? mode.value === "auto_send"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-violet-700 dark:text-violet-400"
                  : "text-neutral-700 dark:text-neutral-300"
              )}
            >
              {mode.label}
            </span>
            <span className="text-[10px] text-neutral-500">{mode.description}</span>
          </button>
        ))}
      </div>

      {currentMode === "auto_send" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            Emails matching your rules will be sent automatically. Review your safeguards carefully.
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// RULE LIST
// ============================================================

interface RuleListProps {
  rules: AutoReplyRule[];
  onEdit: (rule: AutoReplyRule) => void;
  onDelete: (ruleId: string) => void;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onCreate: () => void;
}

export function AutoReplyRuleList({
  rules,
  onEdit,
  onDelete,
  onToggle,
  onCreate,
}: Readonly<RuleListProps>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-neutral-500" />
          <span className="font-medium text-neutral-800 dark:text-neutral-200">Reply Rules</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {rules.length}
          </span>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <Bot className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <p className="font-medium text-neutral-600 dark:text-neutral-400">No rules yet</p>
          <p className="text-sm text-neutral-500">
            Create your first auto-reply rule to get started
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules
            .sort((a, b) => a.priority - b.priority)
            .map((rule) => (
              <div
                key={rule.id}
                className="group flex items-center justify-between rounded-lg border p-3 transition-all hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggle(rule.id, !rule.enabled)}
                    className={cn(
                      "rounded-full p-1",
                      rule.enabled ? "text-green-500" : "text-neutral-400"
                    )}
                  >
                    {rule.enabled ? (
                      <ToggleRight className="h-6 w-6" />
                    ) : (
                      <ToggleLeft className="h-6 w-6" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-medium",
                          rule.enabled
                            ? "text-neutral-800 dark:text-neutral-200"
                            : "text-neutral-500"
                        )}
                      >
                        {rule.name}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">
                        Priority {rule.priority}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      <span>{rule.conditions.length} conditions</span>
                      {rule.stats && (
                        <>
                          <span>•</span>
                          <span>{rule.stats.triggered} triggered</span>
                          <span>•</span>
                          <span>{rule.stats.sent} sent</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onEdit(rule)}
                    className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(rule.id)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// RULE EDITOR
// ============================================================

interface RuleEditorProps {
  rule?: AutoReplyRule;
  onSave: (rule: AutoReplyRule) => void;
  onCancel: () => void;
  userId: string;
  orgId: string;
}

export function AutoReplyRuleEditor({
  rule,
  onSave,
  onCancel,
  userId,
  orgId,
}: Readonly<RuleEditorProps>) {
  const [name, setName] = useState(rule?.name ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? 1);
  const [conditions, setConditions] = useState<RuleCondition[]>(rule?.conditions ?? []);
  const [responseTemplate, setResponseTemplate] = useState(rule?.responseTemplate ?? "");
  const [safeguards, setSafeguards] = useState<RuleSafeguards>(
    rule?.safeguards ?? {
      excludeVip: true,
      excludeDomains: [],
      maxRepliesPerSender: 3,
      cooldownMinutes: 60,
      workingHoursOnly: false,
      requireApproval: false,
    }
  );
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const conditionTypes: { value: RuleCondition["type"]; label: string; icon: React.ReactNode }[] = [
    { value: "sender", label: "Sender", icon: <Users className="h-4 w-4" /> },
    { value: "subject", label: "Subject", icon: <Mail className="h-4 w-4" /> },
    { value: "keyword", label: "Keyword", icon: <Tag className="h-4 w-4" /> },
    { value: "time", label: "Time", icon: <Clock className="h-4 w-4" /> },
    { value: "out_of_office", label: "Out of Office", icon: <Calendar className="h-4 w-4" /> },
  ];

  const addCondition = () => {
    setConditions([...conditions, { type: "sender", operator: "contains", value: "" }]);
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const validateRule = async () => {
    setIsValidating(true);
    setValidationError(null);

    try {
      const response = await fetch("/api/ai/auto-reply/rules/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule: {
            name,
            priority,
            conditions,
            response_template: responseTemplate,
            safeguards,
          },
          user_id: userId,
          org_id: orgId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setValidationError(data.error ?? "Validation failed");
        return false;
      }

      return true;
    } catch {
      setValidationError("Failed to validate rule");
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    const isValid = await validateRule();
    if (!isValid) return;

    onSave({
      id: rule?.id || crypto.randomUUID(),
      name,
      enabled: rule?.enabled ?? true,
      priority,
      conditions,
      responseTemplate,
      safeguards,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          {rule ? "Edit Rule" : "New Rule"}
        </h3>
        <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Basic Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="rule-name"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Rule Name
          </label>
          <input
            id="rule-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Meeting Request Response"
            className="w-full rounded-lg border p-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-neutral-600 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label
            htmlFor="rule-priority"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Priority (1 = highest)
          </label>
          <input
            id="rule-priority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number.parseInt(e.target.value) || 1)}
            min={1}
            max={100}
            className="w-full rounded-lg border p-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-neutral-600 dark:bg-neutral-900"
          />
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Conditions (all must match)
          </span>
          <button onClick={addCondition} className="text-sm text-violet-600 hover:text-violet-700">
            + Add Condition
          </button>
        </div>

        {conditions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No conditions added. Click "Add Condition" to start.
          </div>
        ) : (
          <div className="space-y-2">
            {conditions.map((condition, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <select
                  value={condition.type}
                  onChange={(e) =>
                    updateCondition(index, { type: e.target.value as RuleCondition["type"] })
                  }
                  className="rounded border px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                >
                  {conditionTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>

                <select
                  value={condition.operator}
                  onChange={(e) =>
                    updateCondition(index, {
                      operator: e.target.value as RuleCondition["operator"],
                    })
                  }
                  className="rounded border px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="starts_with">starts with</option>
                  <option value="ends_with">ends with</option>
                  <option value="regex">regex</option>
                </select>

                <input
                  type="text"
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder="Value..."
                  className="flex-1 rounded border px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />

                <button
                  onClick={() => removeCondition(index)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response Template */}
      <div>
        <label
          htmlFor="response-template"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Response Template
        </label>
        <textarea
          id="response-template"
          value={responseTemplate}
          onChange={(e) => setResponseTemplate(e.target.value)}
          placeholder="Write your response template here. Use {sender_name}, {subject}, {date} as placeholders..."
          rows={4}
          className="w-full rounded-lg border p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-neutral-600 dark:bg-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Available placeholders: {"{sender_name}"}, {"{subject}"}, {"{date}"}, {"{my_name}"}
        </p>
      </div>

      {/* Safeguards */}
      <div className="rounded-lg border p-4 dark:border-neutral-700">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-500" />
          <span className="font-medium text-neutral-800 dark:text-neutral-200">Safeguards</span>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={safeguards.excludeVip}
              onChange={(e) => setSafeguards({ ...safeguards, excludeVip: e.target.checked })}
              className="rounded border-neutral-300"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Exclude VIP contacts
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={safeguards.workingHoursOnly}
              onChange={(e) => setSafeguards({ ...safeguards, workingHoursOnly: e.target.checked })}
              className="rounded border-neutral-300"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Working hours only
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={safeguards.requireApproval}
              onChange={(e) => setSafeguards({ ...safeguards, requireApproval: e.target.checked })}
              className="rounded border-neutral-300"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Require approval before sending
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="max-replies"
                className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400"
              >
                Max replies per sender
              </label>
              <input
                id="max-replies"
                type="number"
                value={safeguards.maxRepliesPerSender}
                onChange={(e) =>
                  setSafeguards({
                    ...safeguards,
                    maxRepliesPerSender: Number.parseInt(e.target.value) || 1,
                  })
                }
                min={1}
                className="w-full rounded border px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              />
            </div>
            <div>
              <label
                htmlFor="cooldown"
                className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400"
              >
                Cooldown (minutes)
              </label>
              <input
                id="cooldown"
                type="number"
                value={safeguards.cooldownMinutes}
                onChange={(e) =>
                  setSafeguards({
                    ...safeguards,
                    cooldownMinutes: Number.parseInt(e.target.value) || 0,
                  })
                }
                min={0}
                className="w-full rounded border px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {validationError}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name || isValidating}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {isValidating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save Rule
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AUDIT LOG
// ============================================================

interface AuditLogProps {
  entries: AuditLogEntry[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function AutoReplyAuditLog({
  entries,
  isLoading,
  onLoadMore,
  hasMore,
}: Readonly<AuditLogProps>) {
  const actionColors = {
    suggested: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    drafted: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    sent: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cooldown: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-neutral-500" />
        <span className="font-medium text-neutral-800 dark:text-neutral-200">Audit Log</span>
      </div>

      {entries.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-neutral-500 dark:border-neutral-700">
          No auto-reply activity yet
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3 dark:border-neutral-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                        actionColors[entry.action]
                      )}
                    >
                      {entry.action}
                    </span>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {entry.ruleName}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-neutral-500">
                    <span>From: {entry.emailFrom}</span>
                    <span className="mx-2">•</span>
                    <span>Re: {entry.emailSubject}</span>
                  </div>

                  {entry.blockedReason && (
                    <div className="mt-1 text-xs text-red-500">Blocked: {entry.blockedReason}</div>
                  )}

                  <div className="mt-2 rounded bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {entry.responsePreview.slice(0, 100)}
                    {entry.responsePreview.length > 100 && "..."}
                  </div>
                </div>

                <span className="text-xs text-neutral-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full rounded-lg border py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {isLoading ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// FULL SETTINGS PAGE
// ============================================================

interface AutoReplySettingsProps {
  userId: string;
  orgId: string;
}

export function AutoReplySettings({ userId, orgId }: Readonly<AutoReplySettingsProps>) {
  const [mode, setMode] = useState<AutoReplyMode>("off");
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "audit">("rules");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      // Load stats which includes mode and rules
      const response = await fetch(`/api/ai/auto-reply/stats/${userId}`);
      if (response.ok) {
        const data = (await response.json()) as { mode?: AutoReplyMode; rules?: AutoReplyRule[] };
        setMode(data.mode ?? "off");
        setRules(data.rules ?? []);
      }

      // Load audit log
      const auditResponse = await fetch(`/api/ai/auto-reply/audit/${userId}?limit=20`);
      if (auditResponse.ok) {
        const auditData = (await auditResponse.json()) as { entries?: AuditLogEntry[] };
        setAuditLog(auditData.entries ?? []);
      }
    } catch {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveRule = (rule: AutoReplyRule) => {
    if (editingRule) {
      setRules(rules.map((r) => (r.id === rule.id ? rule : r)));
    } else {
      setRules([...rules, rule]);
    }
    setEditingRule(null);
    setIsCreating(false);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      setRules(rules.filter((r) => r.id !== ruleId));
    }
  };

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    setRules(rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (editingRule || isCreating) {
    return (
      <div className="rounded-xl border bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <AutoReplyRuleEditor
          rule={editingRule ?? undefined}
          onSave={handleSaveRule}
          onCancel={() => {
            setEditingRule(null);
            setIsCreating(false);
          }}
          userId={userId}
          orgId={orgId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="rounded-xl border bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        <AutoReplyModeToggle currentMode={mode} onChange={setMode} />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b dark:border-neutral-700">
        <button
          onClick={() => setActiveTab("rules")}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "rules"
              ? "border-violet-500 text-violet-600 dark:text-violet-400"
              : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Rules
          </div>
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "audit"
              ? "border-violet-500 text-violet-600 dark:text-violet-400"
              : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Audit Log
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
        {activeTab === "rules" ? (
          <AutoReplyRuleList
            rules={rules}
            onEdit={setEditingRule}
            onDelete={handleDeleteRule}
            onToggle={handleToggleRule}
            onCreate={() => setIsCreating(true)}
          />
        ) : (
          <AutoReplyAuditLog entries={auditLog} />
        )}
      </div>
    </div>
  );
}
