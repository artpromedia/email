"use client";

import { useState } from "react";
import {
  KeyRound,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface ApiKeyDisplay {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  daily_limit: number;
  is_active: boolean;
  last_used_at?: string;
  created_at: string;
}

const AVAILABLE_SCOPES = [
  { id: "send", label: "Send", description: "Send emails via API" },
  { id: "read", label: "Read", description: "Read messages and events" },
  { id: "templates", label: "Templates", description: "Manage email templates" },
  { id: "webhooks", label: "Webhooks", description: "Manage webhook endpoints" },
  { id: "analytics", label: "Analytics", description: "View analytics data" },
  { id: "suppressions", label: "Suppressions", description: "Manage suppression list" },
];

function ScopeBadge({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    send: "bg-green-500/10 text-green-400",
    read: "bg-blue-500/10 text-blue-400",
    templates: "bg-purple-500/10 text-purple-400",
    webhooks: "bg-orange-500/10 text-orange-400",
    analytics: "bg-cyan-500/10 text-cyan-400",
    suppressions: "bg-yellow-500/10 text-yellow-400",
    admin: "bg-red-500/10 text-red-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors[scope] ?? "bg-gray-500/10 text-gray-400"}`}
    >
      {scope}
    </span>
  );
}

export default function ConsoleApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [keys, setKeys] = useState<ApiKeyDisplay[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["send", "read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/console/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: selectedScopes,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          key: string;
          api_key: ApiKeyDisplay;
        };
        setCreatedKey(data.key);
        setKeys((prev) => [data.api_key, ...prev]);
        setShowCreate(false);
        setNewKeyName("");
        setSelectedScopes(["send", "read"]);
      }
    } catch {
      // handle error
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;

    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/v1/console/api-keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // handle error
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-gray-400">Create and manage API keys for sending email</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* Newly created key banner */}
      {createdKey && (
        <div className="mt-6 rounded-xl border border-green-500/30 bg-green-500/5 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-400">API key created — copy it now!</h3>
              <p className="mt-1 text-sm text-gray-400">
                This is the only time your full key will be shown. Store it securely.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm">
                  {showKey ? createdKey : "•".repeat(40)}
                </div>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(createdKey)}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-3 text-sm text-gray-400 transition hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create key form */}
      {showCreate && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="font-semibold">Create a new API key</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="key-name" className="mb-1 block text-sm text-gray-400">
                Key name
              </label>
              <input
                id="key-name"
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production, Staging, My App"
                className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <p className="mb-2 text-sm text-gray-400">Permissions</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AVAILABLE_SCOPES.map((scope) => (
                  <button
                    key={scope.id}
                    onClick={() => toggleScope(scope.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      selectedScopes.includes(scope.id)
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded border ${
                          selectedScopes.includes(scope.id)
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-600"
                        } flex items-center justify-center`}
                      >
                        {selectedScopes.includes(scope.id) && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <span className="text-sm font-medium">{scope.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{scope.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim() || selectedScopes.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Key"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewKeyName("");
                }}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key list */}
      <div className="mt-6 space-y-3">
        {keys.length === 0 && !showCreate && (
          <div className="rounded-xl border border-dashed border-white/20 p-12 text-center">
            <KeyRound className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">No API keys yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create an API key to start sending emails via the API
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              Create your first key
            </button>
          </div>
        )}
        {keys.map((key) => (
          <div key={key.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-500" />
                <div>
                  <h3 className="font-semibold">{key.name}</h3>
                  <p className="font-mono text-xs text-gray-500">{key.key_prefix}...</p>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(key.id)}
                className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {key.scopes.map((scope) => (
                <ScopeBadge key={scope} scope={scope} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created {new Date(key.created_at).toLocaleDateString()}
              </span>
              {key.last_used_at && (
                <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
              )}
              <span>
                {key.rate_limit.toLocaleString()}/min • {key.daily_limit.toLocaleString()}/day
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Security notice */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
          <div>
            <h3 className="text-sm font-semibold">Security best practices</h3>
            <ul className="ml-4 mt-1 list-disc space-y-1 text-sm text-gray-400">
              <li>Never expose API keys in client-side code or public repos</li>
              <li>Use environment variables to store keys</li>
              <li>Grant only the permissions each key needs</li>
              <li>Rotate keys regularly and revoke unused ones</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
