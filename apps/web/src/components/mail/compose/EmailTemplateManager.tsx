"use client";

import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  X,
  Search,
  FileText,
  FolderOpen,
  MoreVertical,
  Star,
  StarOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  category?: string;
  isFavorite: boolean;
  variables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
}

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}

interface TemplateCategory {
  id: string;
  name: string;
  icon?: React.ReactNode;
  count: number;
}

interface EmailTemplateManagerProps {
  /** Available templates */
  templates: EmailTemplate[];
  /** Categories for organizing templates */
  categories?: TemplateCategory[];
  /** Callback when a template is selected */
  onSelect?: (template: EmailTemplate) => void;
  /** Callback when a template is created */
  onCreate?: (
    template: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "usageCount">
  ) => void;
  /** Callback when a template is updated */
  onUpdate?: (id: string, template: Partial<EmailTemplate>) => void;
  /** Callback when a template is deleted */
  onDelete?: (id: string) => void;
  /** Callback when template is duplicated */
  onDuplicate?: (id: string) => void;
  /** Callback when favorite status changes */
  onToggleFavorite?: (id: string) => void;
  /** Whether in selection mode (compose dialog) */
  selectionMode?: boolean;
  /** Optional additional CSS classes */
  className?: string;
}

interface TemplateEditorProps {
  template?: EmailTemplate;
  categories: TemplateCategory[];
  onSave: (template: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "usageCount">) => void;
  onCancel: () => void;
}

// ============================================================================
// Default Categories
// ============================================================================

const DEFAULT_CATEGORIES: TemplateCategory[] = [
  { id: "all", name: "All Templates", count: 0 },
  { id: "favorites", name: "Favorites", count: 0 },
  { id: "business", name: "Business", count: 0 },
  { id: "support", name: "Customer Support", count: 0 },
  { id: "sales", name: "Sales", count: 0 },
  { id: "personal", name: "Personal", count: 0 },
];

// ============================================================================
// Sample Templates
// ============================================================================

export const SAMPLE_TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Email",
    subject: "Welcome to {{company}}!",
    body: `Hi {{firstName}},

Welcome to {{company}}! We're thrilled to have you on board.

Here's what you can do next:
• Complete your profile
• Explore our features
• Reach out if you have questions

Best regards,
{{senderName}}
{{company}} Team`,
    category: "business",
    isFavorite: true,
    variables: [
      { key: "firstName", label: "First Name", required: true },
      { key: "company", label: "Company Name", defaultValue: "Our Company" },
      { key: "senderName", label: "Sender Name", required: true },
    ],
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-01-20"),
    usageCount: 45,
  },
  {
    id: "meeting-request",
    name: "Meeting Request",
    subject: "Meeting Request: {{topic}}",
    body: `Hi {{recipientName}},

I hope this message finds you well. I would like to schedule a meeting to discuss {{topic}}.

Proposed time: {{proposedTime}}
Duration: {{duration}}

Please let me know if this works for you, or suggest an alternative time.

Best regards,
{{senderName}}`,
    category: "business",
    isFavorite: false,
    variables: [
      { key: "recipientName", label: "Recipient Name", required: true },
      { key: "topic", label: "Meeting Topic", required: true },
      { key: "proposedTime", label: "Proposed Time" },
      { key: "duration", label: "Duration", defaultValue: "30 minutes" },
      { key: "senderName", label: "Your Name", required: true },
    ],
    createdAt: new Date("2025-01-10"),
    updatedAt: new Date("2025-01-10"),
    usageCount: 28,
  },
  {
    id: "follow-up",
    name: "Follow-up Email",
    subject: "Following up: {{subject}}",
    body: `Hi {{recipientName}},

I wanted to follow up on my previous email regarding {{subject}}.

{{additionalContext}}

I'd appreciate your response when you have a moment.

Best regards,
{{senderName}}`,
    category: "sales",
    isFavorite: true,
    variables: [
      { key: "recipientName", label: "Recipient Name", required: true },
      { key: "subject", label: "Original Subject", required: true },
      { key: "additionalContext", label: "Additional Context" },
      { key: "senderName", label: "Your Name", required: true },
    ],
    createdAt: new Date("2025-01-05"),
    updatedAt: new Date("2025-01-18"),
    usageCount: 67,
  },
  {
    id: "support-response",
    name: "Support Response",
    subject: "Re: {{ticketSubject}} [Ticket #{{ticketNumber}}]",
    body: `Hi {{customerName}},

Thank you for contacting {{company}} support.

{{responseBody}}

If you have any further questions, please don't hesitate to reach out.

Best regards,
{{agentName}}
{{company}} Support Team`,
    category: "support",
    isFavorite: false,
    variables: [
      { key: "customerName", label: "Customer Name", required: true },
      { key: "ticketSubject", label: "Ticket Subject", required: true },
      { key: "ticketNumber", label: "Ticket Number" },
      { key: "responseBody", label: "Response Body", required: true },
      { key: "agentName", label: "Agent Name", required: true },
      { key: "company", label: "Company Name", defaultValue: "Our Company" },
    ],
    createdAt: new Date("2025-01-08"),
    updatedAt: new Date("2025-01-22"),
    usageCount: 134,
  },
];

// ============================================================================
// Template Editor Component
// ============================================================================

function TemplateEditor({ template, categories, onSave, onCancel }: TemplateEditorProps) {
  const [name, setName] = React.useState(template?.name ?? "");
  const [subject, setSubject] = React.useState(template?.subject ?? "");
  const [body, setBody] = React.useState(template?.body ?? "");
  const [category, setCategory] = React.useState(template?.category ?? "business");
  const [isFavorite, setIsFavorite] = React.useState(template?.isFavorite ?? false);
  const [variables, setVariables] = React.useState<TemplateVariable[]>(template?.variables ?? []);
  const [showVariableInput, setShowVariableInput] = React.useState(false);
  const [newVariable, setNewVariable] = React.useState({ key: "", label: "" });

  // Detect variables from template content
  const detectVariables = React.useCallback(() => {
    const regex = /\{\{(\w+)\}\}/g;
    const allText = `${subject} ${body}`;
    const matches = new Set<string>();
    let match;

    while ((match = regex.exec(allText)) !== null) {
      matches.add(match[1]);
    }

    // Add detected variables that don't exist
    const existingKeys = new Set(variables.map((v) => v.key));
    const newVars = [...variables];

    for (const key of matches) {
      if (!existingKeys.has(key)) {
        newVars.push({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1"),
          required: false,
        });
      }
    }

    setVariables(newVars);
  }, [subject, body, variables]);

  const handleAddVariable = () => {
    if (newVariable.key && newVariable.label) {
      setVariables([...variables, { ...newVariable, required: false }]);
      setNewVariable({ key: "", label: "" });
      setShowVariableInput(false);
    }
  };

  const handleRemoveVariable = (key: string) => {
    setVariables(variables.filter((v) => v.key !== key));
  };

  const handleSave = () => {
    if (!name.trim() || !subject.trim()) return;

    onSave({
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      category,
      isFavorite,
      variables,
    });
  };

  const isValid = name.trim() && subject.trim();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-lg font-semibold">{template ? "Edit Template" : "Create Template"}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Name */}
        <div>
          <label htmlFor="template-name" className="mb-1.5 block text-sm font-medium">
            Template Name *
          </label>
          <input
            id="template-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Welcome Email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Category */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="template-category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <select
              id="template-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {categories
                .filter((c) => c.id !== "all" && c.id !== "favorites")
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
                isFavorite
                  ? "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                  : "hover:bg-muted"
              )}
            >
              {isFavorite ? (
                <Star className="h-4 w-4 fill-current" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
              {isFavorite ? "Favorited" : "Add to favorites"}
            </button>
          </div>
        </div>

        {/* Subject */}
        <div>
          <label htmlFor="template-subject" className="mb-1.5 block text-sm font-medium">
            Subject Line *
          </label>
          <input
            id="template-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Welcome to {{company}}!"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use {"{{variable}}"} syntax for dynamic content
          </p>
        </div>

        {/* Body */}
        <div>
          <label htmlFor="template-body" className="mb-1.5 block text-sm font-medium">
            Email Body
          </label>
          <textarea
            id="template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Write your template content here..."
            className="w-full resize-none rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={detectVariables}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Detect variables from content
          </button>
        </div>

        {/* Variables */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-sm font-medium">Template Variables</span>
            <button
              type="button"
              onClick={() => setShowVariableInput(true)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add variable
            </button>
          </div>

          {showVariableInput && (
            <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/50 p-2">
              <input
                type="text"
                value={newVariable.key}
                onChange={(e) =>
                  setNewVariable({ ...newVariable, key: e.target.value.replace(/\s/g, "") })
                }
                placeholder="variableKey"
                className="flex-1 rounded border bg-background px-2 py-1 text-sm"
              />
              <input
                type="text"
                value={newVariable.label}
                onChange={(e) => setNewVariable({ ...newVariable, label: e.target.value })}
                placeholder="Display Label"
                className="flex-1 rounded border bg-background px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={handleAddVariable}
                className="rounded bg-primary p-1 text-primary-foreground"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowVariableInput(false)}
                className="rounded border p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            {variables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No variables defined. Add {"{{variable}}"} syntax in your template.
              </p>
            ) : (
              variables.map((variable) => (
                <div
                  key={variable.key}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-primary">{`{{${variable.key}}}`}</span>
                    <span className="ml-2 text-muted-foreground">→ {variable.label}</span>
                    {variable.required && (
                      <span className="ml-2 text-xs text-destructive">*required</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveVariable(variable.key)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Template Card Component
// ============================================================================

interface TemplateCardProps {
  template: EmailTemplate;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  selectionMode?: boolean;
}

function TemplateCard({
  template,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  selectionMode,
}: TemplateCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    if (!showMenu) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const cardContent = (
    <>
      {/* Favorite star */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          "absolute right-10 top-3",
          template.isFavorite ? "text-yellow-500" : "text-muted-foreground/50 hover:text-yellow-500"
        )}
        aria-label={template.isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={cn("h-4 w-4", template.isFavorite && "fill-current")} />
      </button>

      {/* Menu button */}
      <div ref={menuRef} className="absolute right-3 top-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Template options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-8 z-10 w-40 rounded-md border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <FileText className="h-4 w-4" />
              Use template
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </button>
            <hr className="my-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Template content */}
      <div className="pr-16">
        <h4 className="font-medium">{template.name}</h4>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{template.subject}</p>
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.body}</p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Used {template.usageCount} times</span>
        <span>{template.variables.length} variables</span>
      </div>
    </>
  );

  // Use a button wrapper in selection mode for proper accessibility
  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group relative w-full rounded-lg border p-4 text-left transition-all",
          "hover:border-primary/50 hover:shadow-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-4 transition-all",
        "hover:border-primary/50 hover:shadow-sm"
      )}
    >
      {cardContent}
    </div>
  );
}

// ============================================================================
// Main Template Manager Component
// ============================================================================

/**
 * Email Template Manager component
 *
 * Features:
 * - Create, edit, delete email templates
 * - Template variables with {{variable}} syntax
 * - Category organization
 * - Favorites system
 * - Search and filter
 * - Usage tracking
 *
 * @example
 * ```tsx
 * <EmailTemplateManager
 *   templates={templates}
 *   onSelect={(template) => applyToCompose(template)}
 *   onCreate={createTemplate}
 *   onUpdate={updateTemplate}
 *   onDelete={deleteTemplate}
 * />
 * ```
 */
export function EmailTemplateManager({
  templates,
  categories = DEFAULT_CATEGORIES,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  selectionMode = false,
  className,
}: EmailTemplateManagerProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("all");
  const [editingTemplate, setEditingTemplate] = React.useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // Calculate category counts
  const categoriesWithCounts = React.useMemo(() => {
    return categories.map((cat) => ({
      ...cat,
      count:
        cat.id === "all"
          ? templates.length
          : cat.id === "favorites"
            ? templates.filter((t) => t.isFavorite).length
            : templates.filter((t) => t.category === cat.id).length,
    }));
  }, [categories, templates]);

  // Filter templates
  const filteredTemplates = React.useMemo(() => {
    let result = templates;

    // Category filter
    if (activeCategory === "favorites") {
      result = result.filter((t) => t.isFavorite);
    } else if (activeCategory !== "all") {
      result = result.filter((t) => t.category === activeCategory);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query) ||
          t.body.toLowerCase().includes(query)
      );
    }

    return result;
  }, [templates, activeCategory, searchQuery]);

  const handleSaveTemplate = (
    templateData: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "usageCount">
  ) => {
    if (editingTemplate) {
      onUpdate?.(editingTemplate.id, templateData);
    } else {
      onCreate?.(templateData);
    }
    setEditingTemplate(null);
    setIsCreating(false);
  };

  // Show editor when creating or editing
  if (isCreating || editingTemplate) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <TemplateEditor
          template={editingTemplate ?? undefined}
          categories={categoriesWithCounts}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setIsCreating(false);
            setEditingTemplate(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-lg font-semibold">Email Templates</h3>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Categories */}
        <div className="w-48 shrink-0 overflow-y-auto border-r">
          <nav className="space-y-1 p-2">
            {categoriesWithCounts.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                  activeCategory === cat.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2">
                  {cat.id === "favorites" ? (
                    <Star className="h-4 w-4" />
                  ) : (
                    <FolderOpen className="h-4 w-4" />
                  )}
                  {cat.name}
                </span>
                <span className="text-xs">{cat.count}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search */}
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-md border bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Template grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredTemplates.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h4 className="mt-4 font-medium">No templates found</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchQuery
                    ? "Try a different search term"
                    : "Create your first template to get started"}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Create Template
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selectionMode={selectionMode}
                    onSelect={() => onSelect?.(template)}
                    onEdit={() => setEditingTemplate(template)}
                    onDelete={() => onDelete?.(template.id)}
                    onDuplicate={() => onDuplicate?.(template.id)}
                    onToggleFavorite={() => onToggleFavorite?.(template.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailTemplateManager;
