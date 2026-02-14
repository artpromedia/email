"use client";

/**
 * Transactional Email - Templates Management
 * List, create, edit, and preview email templates
 */

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Trash2, RefreshCw, Copy, Edit, Eye, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@email/ui";

const API_BASE = "/api/v1/transactional";

interface Template {
  id: string;
  name: string;
  subject: string;
  category: string;
  tags: string[];
  version: number;
  active_version: number;
  created_at: string;
  updated_at: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newHtml, setNewHtml] = useState("<p>Hello {{name}},</p>\n<p>{{body}}</p>");
  const [newText, setNewText] = useState("Hello {{name}},\n\n{{body}}");
  const [newCategory, setNewCategory] = useState("transactional");

  // Edit form
  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  const [editText, setEditText] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/templates`);
      if (!res.ok) {
        if (res.status === 500) {
          // Service may not have templates table initialized
          setTemplates([]);
          return;
        }
        throw new Error("Failed to fetch templates");
      }
      const data = (await res.json()) as
        | Template[]
        | { data?: Template[]; templates?: Template[] }
        | null;
      if (Array.isArray(data)) {
        setTemplates(data);
      } else if (data && typeof data === "object") {
        setTemplates(data.data ?? data.templates ?? []);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newName.trim() || !newSubject.trim()) return;
    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          subject: newSubject.trim(),
          html_content: newHtml,
          text_content: newText,
          category: newCategory,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create template");
      }
      setShowCreateDialog(false);
      setNewName("");
      setNewSubject("");
      setNewHtml("<p>Hello {{name}},</p>\n<p>{{body}}</p>");
      setNewText("Hello {{name}},\n\n{{body}}");
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editingTemplate) return;
    try {
      const res = await fetch(`${API_BASE}/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          html_content: editHtml,
          text_content: editText,
        }),
      });
      if (!res.ok) throw new Error("Failed to update template");
      setShowEditDialog(false);
      setEditingTemplate(null);
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update template");
    }
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!confirm(`Delete template "${templateName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  const handleClone = async (templateId: string) => {
    try {
      const res = await fetch(`${API_BASE}/templates/${templateId}/clone`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to clone template");
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone template");
    }
  };

  const openEditDialog = async (template: Template) => {
    try {
      const res = await fetch(`${API_BASE}/templates/${template.id}`);
      if (!res.ok) throw new Error("Failed to fetch template details");
      const data = (await res.json()) as {
        subject?: string;
        html_content?: string;
        text_content?: string;
      } | null;
      setEditingTemplate(template);
      setEditSubject(data?.subject ?? template.subject);
      setEditHtml(data?.html_content ?? "");
      setEditText(data?.text_content ?? "");
      setShowEditDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    }
  };

  const filteredTemplates = templates.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Templates</CardTitle>
              <CardDescription>
                Create reusable email templates with variable substitution
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Email Template</DialogTitle>
                  <DialogDescription>
                    Create a reusable template. Use {"{{variable}}"} syntax for dynamic content.
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="template-name">Template Name</Label>
                      <Input
                        id="template-name"
                        placeholder="e.g., Welcome Email"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="template-category">Category</Label>
                      <Input
                        id="template-category"
                        placeholder="e.g., transactional"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="template-subject">Subject Line</Label>
                    <Input
                      id="template-subject"
                      placeholder="e.g., Welcome to {{company}}, {{name}}!"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-html">HTML Content</Label>
                    <textarea
                      id="template-html"
                      rows={8}
                      value={newHtml}
                      onChange={(e) => setNewHtml(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                      placeholder="<p>Hello {{name}},</p>"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-text">Plain Text Content</Label>
                    <textarea
                      id="template-text"
                      rows={4}
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                      placeholder="Hello {{name}},"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim() || !newSubject.trim()}
                  >
                    {creating ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Template"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {searchQuery
                ? "No templates match your search"
                : "No templates created yet. Create one to get started."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.category && (
                          <Badge variant="outline" className="text-xs">
                            {template.category}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          v{template.version || template.active_version || 1}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">{template.subject}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        Updated{" "}
                        {new Date(template.updated_at || template.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleClone(template.id)}>
                      <Copy className="mr-1 h-3 w-3" />
                      Clone
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(template.id, template.name)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>Update the template content and subject line.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
            <div>
              <Label htmlFor="edit-subject">Subject Line</Label>
              <Input
                id="edit-subject"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-html">HTML Content</Label>
              <textarea
                id="edit-html"
                rows={10}
                value={editHtml}
                onChange={(e) => setEditHtml(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="edit-text">Plain Text Content</Label>
              <textarea
                id="edit-text"
                rows={5}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>
              <Eye className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
