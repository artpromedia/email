"use client";

/**
 * Email Filter Rules Management
 * Create and manage automatic email filtering rules
 *
 * Features:
 * - Create rules based on sender, subject, content
 * - Actions: move to folder, apply label, star, delete, mark read
 * - Rule priority ordering
 * - Enable/disable rules
 */

import { useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Power,
  Save,
  X,
  FolderInput,
  Tag,
  Star,
  MailOpen,
  Trash,
  Forward,
  Copy,
} from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

export type MatchField = "from" | "to" | "subject" | "body" | "hasAttachment";
export type MatchOperator = "contains" | "equals" | "startsWith" | "endsWith" | "regex";
export type RuleAction =
  | "moveToFolder"
  | "applyLabel"
  | "star"
  | "markRead"
  | "delete"
  | "forward"
  | "neverSpam";

export interface RuleCondition {
  id: string;
  field: MatchField;
  operator: MatchOperator;
  value: string;
}

export interface RuleActionConfig {
  type: RuleAction;
  value?: string; // folder ID, label ID, or forward address
}

export interface EmailRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  conditionLogic: "all" | "any";
  actions: RuleActionConfig[];
  priority: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const FIELD_OPTIONS: { value: MatchField; label: string }[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body contains" },
  { value: "hasAttachment", label: "Has attachment" },
];

const OPERATOR_OPTIONS: { value: MatchOperator; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "regex", label: "matches regex" },
];

const ACTION_OPTIONS: {
  value: RuleAction;
  label: string;
  icon: typeof FolderInput;
  needsValue: boolean;
}[] = [
  { value: "moveToFolder", label: "Move to folder", icon: FolderInput, needsValue: true },
  { value: "applyLabel", label: "Apply label", icon: Tag, needsValue: true },
  { value: "star", label: "Star it", icon: Star, needsValue: false },
  { value: "markRead", label: "Mark as read", icon: MailOpen, needsValue: false },
  { value: "delete", label: "Delete it", icon: Trash, needsValue: false },
  { value: "forward", label: "Forward to", icon: Forward, needsValue: true },
  { value: "neverSpam", label: "Never send to spam", icon: Copy, needsValue: false },
];

// ============================================================
// CONDITION EDITOR
// ============================================================

interface ConditionEditorProps {
  condition: RuleCondition;
  onChange: (condition: RuleCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ConditionEditor({ condition, onChange, onRemove, canRemove }: ConditionEditorProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value as MatchField })}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        {FIELD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {condition.field !== "hasAttachment" && (
        <>
          <select
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as MatchOperator })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {OPERATOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="Enter value..."
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
        </>
      )}

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ============================================================
// ACTION EDITOR
// ============================================================

interface ActionEditorProps {
  action: RuleActionConfig;
  onChange: (action: RuleActionConfig) => void;
  onRemove: () => void;
  canRemove: boolean;
  folders: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

function ActionEditor({
  action,
  onChange,
  onRemove,
  canRemove,
  folders,
  labels,
}: ActionEditorProps) {
  const actionOption = ACTION_OPTIONS.find((a) => a.value === action.type);
  const Icon = actionOption?.icon ?? FolderInput;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />

      <select
        value={action.type}
        onChange={(e) => onChange({ type: e.target.value as RuleAction, value: undefined })}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {action.type === "moveToFolder" && (
        <select
          value={action.value || ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select folder...</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}

      {action.type === "applyLabel" && (
        <select
          value={action.value || ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select label...</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {action.type === "forward" && (
        <input
          type="email"
          value={action.value || ""}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="Forward to email..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ============================================================
// RULE EDITOR MODAL
// ============================================================

interface RuleEditorProps {
  rule?: EmailRule;
  onSave: (rule: EmailRule) => void;
  onCancel: () => void;
  folders: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

function RuleEditor({ rule, onSave, onCancel, folders, labels }: RuleEditorProps) {
  const isNew = !rule;

  const [name, setName] = useState(rule?.name ?? "");
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule?.conditions ?? [
      { id: crypto.randomUUID(), field: "from", operator: "contains", value: "" },
    ]
  );
  const [conditionLogic, setConditionLogic] = useState<"all" | "any">(
    rule?.conditionLogic ?? "all"
  );
  const [actions, setActions] = useState<RuleActionConfig[]>(
    rule?.actions ?? [{ type: "moveToFolder" }]
  );

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();

    const newRule: EmailRule = {
      id: rule?.id ?? crypto.randomUUID(),
      name,
      enabled: rule?.enabled ?? true,
      conditions,
      conditionLogic,
      actions,
      priority: rule?.priority ?? 0,
      createdAt: rule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newRule);
  };

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        id: crypto.randomUUID(),
        field: "from",
        operator: "contains",
        value: "",
      },
    ]);
  };

  const updateCondition = (index: number, condition: RuleCondition) => {
    const updated = [...conditions];
    updated[index] = condition;
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const addAction = () => {
    setActions([...actions, { type: "applyLabel" }]);
  };

  const updateAction = (index: number, action: RuleActionConfig) => {
    const updated = [...actions];
    updated[index] = action;
    setActions(updated);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Rule Name */}
      <div>
        <label htmlFor="rule-name" className="mb-2 block text-sm font-medium">
          Rule Name
        </label>
        <input
          id="rule-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Move newsletters to Reading"
          className="w-full rounded-lg border bg-background px-4 py-2"
          required
        />
      </div>

      {/* Conditions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium">
            When{" "}
            <select
              value={conditionLogic}
              onChange={(e) => setConditionLogic(e.target.value as "all" | "any")}
              className="rounded border bg-background px-2 py-1 text-sm font-normal"
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>{" "}
            of these conditions match:
          </label>
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add condition
          </button>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <ConditionEditor
              key={condition.id}
              condition={condition}
              onChange={(c) => updateCondition(index, c)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Then do this:</span>
          <button
            type="button"
            onClick={addAction}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add action
          </button>
        </div>

        <div className="space-y-2">
          {actions.map((action, index) => (
            <ActionEditor
              key={index}
              action={action}
              onChange={(a) => updateAction(index, a)}
              onRemove={() => removeAction(index)}
              canRemove={actions.length > 1}
              folders={folders}
              labels={labels}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-4 py-2 transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          {isNew ? "Create Rule" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// RULE LIST ITEM
// ============================================================

interface RuleListItemProps {
  rule: EmailRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function RuleListItem({
  rule,
  onEdit,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: RuleListItemProps) {
  const conditionSummary = rule.conditions
    .map((c) => `${c.field} ${c.operator} "${c.value}"`)
    .join(rule.conditionLogic === "all" ? " AND " : " OR ");

  const actionSummary = rule.actions
    .map((a) => {
      const opt = ACTION_OPTIONS.find((o) => o.value === a.type);
      return a.value ? `${opt?.label}: ${a.value}` : opt?.label;
    })
    .join(", ");

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        rule.enabled ? "bg-background" : "bg-muted/50 opacity-60"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Drag handle & reorder */}
        <div className="flex flex-col gap-1 pt-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Rule content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="truncate font-medium">{rule.name}</h3>
            {!rule.enabled && <span className="text-xs text-muted-foreground">(disabled)</span>}
          </div>
          <p className="mb-1 truncate text-sm text-muted-foreground">If: {conditionSummary}</p>
          <p className="truncate text-sm text-muted-foreground">Then: {actionSummary}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={cn(
              "rounded-lg p-2 transition-colors",
              rule.enabled
                ? "text-green-600 hover:bg-green-50"
                : "text-muted-foreground hover:bg-muted"
            )}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit rule"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN FILTER RULES MANAGER
// ============================================================

interface FilterRulesManagerProps {
  rules: EmailRule[];
  onRulesChange: (rules: EmailRule[]) => void;
  folders: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  className?: string;
}

export function FilterRulesManager({
  rules,
  onRulesChange,
  folders,
  labels,
  className,
}: FilterRulesManagerProps) {
  const [editingRule, setEditingRule] = useState<EmailRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = useCallback(
    (rule: EmailRule) => {
      const isNew = !rules.find((r) => r.id === rule.id);

      if (isNew) {
        onRulesChange([...rules, { ...rule, priority: rules.length }]);
      } else {
        onRulesChange(rules.map((r) => (r.id === rule.id ? rule : r)));
      }

      setEditingRule(null);
      setIsCreating(false);
    },
    [rules, onRulesChange]
  );

  const handleDelete = useCallback(
    (ruleId: string) => {
      if (confirm("Are you sure you want to delete this rule?")) {
        onRulesChange(rules.filter((r) => r.id !== ruleId));
      }
    },
    [rules, onRulesChange]
  );

  const handleToggle = useCallback(
    (ruleId: string) => {
      onRulesChange(rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)));
    },
    [rules, onRulesChange]
  );

  const handleMove = useCallback(
    (ruleId: string, direction: "up" | "down") => {
      const index = rules.findIndex((r) => r.id === ruleId);
      if (index === -1) return;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= rules.length) return;

      const newRules = [...rules];
      const currentRule = newRules[index];
      const targetRule = newRules[newIndex];
      if (!currentRule || !targetRule) return;
      [newRules[index], newRules[newIndex]] = [targetRule, currentRule];

      // Update priorities
      onRulesChange(newRules.map((r, i) => ({ ...r, priority: i })));
    },
    [rules, onRulesChange]
  );

  const showEditor = isCreating || editingRule;

  return (
    <div className={cn("", className)}>
      {showEditor ? (
        <div className="rounded-lg border bg-background p-6">
          <h2 className="mb-4 text-lg font-semibold">
            {editingRule ? "Edit Filter Rule" : "Create Filter Rule"}
          </h2>
          <RuleEditor
            rule={editingRule ?? undefined}
            onSave={handleSave}
            onCancel={() => {
              setEditingRule(null);
              setIsCreating(false);
            }}
            folders={folders}
            labels={labels}
          />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Email Filter Rules</h2>
              <p className="text-sm text-muted-foreground">
                Automatically organize incoming emails
              </p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Rule
            </button>
          </div>

          {/* Rules list */}
          {rules.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 py-12 text-center">
              <FolderInput className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-1 font-medium">No filter rules yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Create rules to automatically organize your emails
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules
                .sort((a, b) => a.priority - b.priority)
                .map((rule, index) => (
                  <RuleListItem
                    key={rule.id}
                    rule={rule}
                    onEdit={() => setEditingRule(rule)}
                    onDelete={() => handleDelete(rule.id)}
                    onToggle={() => handleToggle(rule.id)}
                    onMoveUp={() => handleMove(rule.id, "up")}
                    onMoveDown={() => handleMove(rule.id, "down")}
                    isFirst={index === 0}
                    isLast={index === rules.length - 1}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FilterRulesManager;
