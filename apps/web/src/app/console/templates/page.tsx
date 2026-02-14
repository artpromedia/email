"use client";

import { useState } from "react";
import { FileText, Plus, Pencil, Trash2, Copy, Eye, Code2, Clock } from "lucide-react";

interface Template {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body?: string;
  variables: string[];
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const STARTER_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #ffffff; border: 1px solid #e5e5e5; }
    .footer { padding: 16px 20px; background: #f5f5f5; border-radius: 0 0 8px 8px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{subject}}</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>{{body}}</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} Your Company</p>
    </div>
  </div>
</body>
</html>`;

export default function ConsoleTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formHtml, setFormHtml] = useState(STARTER_HTML);
  const [formText, setFormText] = useState("");
  const [saving, setSaving] = useState(false);

  const extractVariables = (html: string): string[] => {
    const matches = html.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setFormName("");
    setFormSubject("");
    setFormHtml(STARTER_HTML);
    setFormText("");
  };

  const startEdit = (template: Template) => {
    setEditing(template);
    setCreating(false);
    setFormName(template.name);
    setFormSubject(template.subject);
    setFormHtml(template.html_body);
    setFormText(template.text_body ?? "");
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSubject.trim()) return;
    setSaving(true);

    try {
      const token = localStorage.getItem("token");
      const variables = extractVariables(formHtml);
      const body = {
        name: formName.trim(),
        subject: formSubject.trim(),
        html_body: formHtml,
        text_body: formText || undefined,
        variables,
      };

      if (editing) {
        const res = await fetch(`/api/v1/console/templates/${editing.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = (await res.json()) as Template;
          setTemplates((prev) => prev.map((t) => (t.id === editing.id ? updated : t)));
        }
      } else {
        const res = await fetch("/api/v1/console/templates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const created = (await res.json()) as Template;
          setTemplates((prev) => [created, ...prev]);
        }
      }
    } catch {
      // handle error
    } finally {
      setSaving(false);
      setCreating(false);
      setEditing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/v1/console/templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // handle error
    }
  };

  const isEditorOpen = creating || editing !== null;

  return (
    <div className="max-w-5xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="mt-1 text-sm text-gray-400">Create and manage reusable email templates</p>
        </div>
        {!isEditorOpen && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        )}
      </div>

      {/* Editor */}
      {isEditorOpen && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="mb-4 font-semibold">{editing ? "Edit template" : "Create template"}</h3>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-name" className="mb-1 block text-sm text-gray-400">
                  Template name
                </label>
                <input
                  id="tpl-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Welcome Email"
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="tpl-subject" className="mb-1 block text-sm text-gray-400">
                  Subject line
                </label>
                <input
                  id="tpl-subject"
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g., Welcome to {{company}}"
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tpl-html" className="mb-1 block text-sm text-gray-400">
                HTML body
              </label>
              <textarea
                id="tpl-html"
                value={formHtml}
                onChange={(e) => setFormHtml(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="tpl-text" className="mb-1 block text-sm text-gray-400">
                Plain text body <span className="text-gray-600">(optional)</span>
              </label>
              <textarea
                id="tpl-text"
                value={formText}
                onChange={(e) => setFormText(e.target.value)}
                rows={4}
                placeholder="Fallback plain text version..."
                className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Detected variables */}
            {extractVariables(formHtml + formSubject).length > 0 && (
              <div className="rounded-lg bg-white/5 p-3">
                <p className="mb-2 text-xs text-gray-400">Detected template variables:</p>
                <div className="flex flex-wrap gap-1.5">
                  {extractVariables(formHtml + formSubject).map((v) => (
                    <span
                      key={v}
                      className="rounded bg-purple-500/10 px-1.5 py-0.5 font-mono text-xs text-purple-400"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formSubject.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Update Template" : "Create Template"}
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="mt-6 space-y-3">
        {templates.length === 0 && !isEditorOpen && (
          <div className="rounded-xl border border-dashed border-white/20 p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">No templates yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create reusable email templates with dynamic variables
            </p>
            <button
              onClick={startCreate}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              Create your first template
            </button>
          </div>
        )}

        {templates.map((template) => (
          <div key={template.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{template.name}</h3>
                <p className="mt-0.5 text-sm text-gray-400">Subject: {template.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewId(previewId === template.id ? null : template.id)}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(template.id)}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                  title="Copy ID"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startEdit(template)}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Code2 className="h-3 w-3" />
                {template.variables.length} variable
                {template.variables.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />v{template.version}
              </span>
              <span>Updated {new Date(template.updated_at).toLocaleDateString()}</span>
            </div>

            {/* Preview */}
            {previewId === template.id && (
              <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 text-xs text-gray-400">
                  <Eye className="h-3 w-3" />
                  HTML Preview
                </div>
                <div
                  className="max-h-96 overflow-y-auto bg-white p-4 text-sm text-black"
                  dangerouslySetInnerHTML={{
                    __html: template.html_body,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Usage guide */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="mb-3 text-sm font-semibold">Using templates via SDK</h3>
        <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-xs text-gray-300">
          {`import { OonruMail } from '@oonrumail/sdk';

const client = new OonruMail({ apiKey: 'em_...' });

await client.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  templateId: 'tpl_abc123',
  templateData: {
    name: 'John',
    company: 'Acme',
  },
});`}
        </pre>
      </div>
    </div>
  );
}
