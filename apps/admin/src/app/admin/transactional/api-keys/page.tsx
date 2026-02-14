"use client";

/**
 * Transactional Email - API Keys Management
 * List, create, and revoke API keys
 */

import { useCallback, useEffect, useState } from "react";
import { Key, Plus, Trash2, RefreshCw, Copy, CheckCircle, Eye, EyeOff } from "lucide-react";
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

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  daily_limit: number;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const AVAILABLE_SCOPES = [
  { value: "send", label: "Send", description: "Send transactional emails" },
  { value: "read", label: "Read", description: "Read messages, events, analytics" },
  { value: "templates", label: "Templates", description: "Manage email templates" },
  { value: "webhooks", label: "Webhooks", description: "Manage webhooks" },
  { value: "analytics", label: "Analytics", description: "View analytics data" },
  { value: "suppression", label: "Suppressions", description: "Manage suppression lists" },
  { value: "admin", label: "Admin", description: "Full administrative access" },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["send", "read"]);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api-keys`);
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const data = (await res.json()) as { data?: ApiKey[] } | null;
      setKeys(data?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: selectedScopes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create API key");
      }
      const data = (await res.json()) as { key?: string; api_key?: string } | null;
      setCreatedKey(data?.key ?? data?.api_key ?? null);
      setShowKey(true);
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string, keyName: string) => {
    if (
      !confirm(`Are you sure you want to revoke the API key "${keyName}"? This cannot be undone.`)
    )
      return;
    try {
      const res = await fetch(`${API_BASE}/api-keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke API key");
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  };

  const handleRotate = async (keyId: string) => {
    if (!confirm("Rotate this key? The old key will stop working immediately.")) return;
    try {
      const res = await fetch(`${API_BASE}/api-keys/${keyId}/rotate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to rotate API key");
      const data = (await res.json()) as { key?: string; api_key?: string } | null;
      setCreatedKey(data?.key ?? data?.api_key ?? null);
      setShowKey(true);
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate API key");
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const resetCreateDialog = () => {
    setNewKeyName("");
    setSelectedScopes(["send", "read"]);
    setCreatedKey(null);
    setShowKey(false);
    setShowCreateDialog(false);
  };

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

      {/* Created Key Banner */}
      {createdKey && (
        <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-800 dark:text-green-200">
              API Key Created — Copy it now, it won&apos;t be shown again!
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white p-2 font-mono text-sm dark:bg-gray-900">
              {showKey ? createdKey : "•".repeat(40)}
            </code>
            <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdKey)}>
              {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Create and manage API keys for sending transactional emails
              </CardDescription>
            </div>
            <Dialog
              open={showCreateDialog}
              onOpenChange={(open) => (open ? setShowCreateDialog(true) : resetCreateDialog())}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for sending transactional emails. The key will only be
                    shown once.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      placeholder="e.g., Production Mailer"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Permissions</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {AVAILABLE_SCOPES.map((scope) => (
                        <label
                          key={scope.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors ${
                            selectedScopes.includes(scope.value)
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope.value)}
                            onChange={() => toggleScope(scope.value)}
                            className="rounded"
                          />
                          <div>
                            <div className="text-sm font-medium">{scope.label}</div>
                            <div className="text-xs text-gray-500">{scope.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={resetCreateDialog}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !newKeyName.trim() || selectedScopes.length === 0}
                  >
                    {creating ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Key"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No API keys created yet. Create one to start sending transactional emails.
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <Key className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                          {key.key_prefix}...
                        </code>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                        {key.last_used_at && (
                          <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                        )}
                        <span>Rate limit: {key.rate_limit}/s</span>
                      </div>
                      <div className="mt-2 flex gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleRotate(key.id)}>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Rotate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevoke(key.id, key.name)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
