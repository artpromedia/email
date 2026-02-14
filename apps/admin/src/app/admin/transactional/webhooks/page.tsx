"use client";

/**
 * Transactional Email - Webhooks Management
 * Configure webhook endpoints for email events (delivered, bounced, opened, clicked, etc.)
 */

import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
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

const AVAILABLE_EVENTS = [
  { value: "delivered", label: "Delivered", description: "Email successfully delivered" },
  { value: "bounced", label: "Bounced", description: "Email bounced" },
  { value: "opened", label: "Opened", description: "Email opened by recipient" },
  { value: "clicked", label: "Clicked", description: "Link clicked in email" },
  { value: "complained", label: "Complained", description: "Marked as spam" },
  { value: "unsubscribed", label: "Unsubscribed", description: "Recipient unsubscribed" },
  { value: "deferred", label: "Deferred", description: "Delivery deferred/retrying" },
  { value: "dropped", label: "Dropped", description: "Email dropped before sending" },
];

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  failure_count?: number;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    msg: string;
  } | null>(null);

  // Create form
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/webhooks`);
      if (!res.ok) {
        if (res.status === 500) {
          setWebhooks([]);
          return;
        }
        throw new Error("Failed to fetch webhooks");
      }
      const data = (await res.json()) as
        | Webhook[]
        | { data?: Webhook[]; webhooks?: Webhook[] }
        | null;
      if (Array.isArray(data)) {
        setWebhooks(data);
      } else if (data && typeof data === "object") {
        setWebhooks(data.data ?? data.webhooks ?? []);
      } else {
        setWebhooks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = async () => {
    if (!newUrl.trim() || selectedEvents.length === 0) return;
    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: selectedEvents,
          active: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create webhook");
      }
      setShowCreateDialog(false);
      setNewUrl("");
      setSelectedEvents([]);
      void fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (webhookId: string, url: string) => {
    if (!confirm(`Delete webhook for "${url}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/webhooks/${webhookId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete webhook");
      void fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete webhook");
    }
  };

  const handleTest = async (webhookId: string) => {
    try {
      setTesting(webhookId);
      setTestResult(null);
      const res = await fetch(`${API_BASE}/webhooks/${webhookId}/test`, {
        method: "POST",
      });
      if (!res.ok) {
        setTestResult({ id: webhookId, success: false, msg: `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { success?: boolean; message?: string } | null;
      setTestResult({
        id: webhookId,
        success: data?.success ?? true,
        msg: data?.message ?? "Test event sent",
      });
    } catch (err) {
      setTestResult({
        id: webhookId,
        success: false,
        msg: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      const res = await fetch(`${API_BASE}/webhooks/${webhook.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !webhook.active }),
      });
      if (!res.ok) throw new Error("Failed to update webhook");
      void fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update webhook");
    }
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhooks</CardTitle>
              <CardDescription>
                Receive real-time notifications for email events (delivery, bounce, open, click,
                etc.)
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Webhook Endpoint</DialogTitle>
                  <DialogDescription>
                    We'll send a POST request to your URL for each selected event.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="webhook-url">Endpoint URL</Label>
                    <Input
                      id="webhook-url"
                      type="url"
                      placeholder="https://example.com/webhooks/email"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Events to subscribe</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {AVAILABLE_EVENTS.map((evt) => (
                        <label
                          key={evt.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                            selectedEvents.includes(evt.value)
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                              : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEvents.includes(evt.value)}
                            onChange={() => toggleEvent(evt.value)}
                            className="rounded"
                          />
                          <div>
                            <div className="font-medium">{evt.label}</div>
                            <div className="text-xs text-gray-500">{evt.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !newUrl.trim() || selectedEvents.length === 0}
                  >
                    {creating ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Add Webhook"
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
          ) : webhooks.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No webhooks configured yet. Add one to receive email event notifications.
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="mt-0.5 h-5 w-5 text-blue-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-medium">{webhook.url}</code>
                          <Badge
                            variant={webhook.active ? "default" : "secondary"}
                            className="cursor-pointer text-xs"
                            onClick={() => handleToggleActive(webhook)}
                          >
                            {webhook.active ? "Active" : "Paused"}
                          </Badge>
                          {(webhook.failure_count ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              {webhook.failure_count} failures
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {webhook.events?.map((evt) => (
                            <Badge key={evt} variant="outline" className="text-xs">
                              {evt}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-gray-400">
                          <span>Created {new Date(webhook.created_at).toLocaleDateString()}</span>
                          {webhook.last_triggered_at && (
                            <span>
                              Last triggered {new Date(webhook.last_triggered_at).toLocaleString()}
                            </span>
                          )}
                          {webhook.secret && (
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Signed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(webhook.id)}
                        disabled={testing === webhook.id}
                      >
                        {testing === webhook.id ? (
                          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="mr-1 h-3 w-3" />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(webhook.id, webhook.url)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Test result */}
                  {testResult?.id === webhook.id && (
                    <div
                      className={`mt-3 flex items-center gap-2 rounded-md p-2 text-sm ${
                        testResult.success
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {testResult.msg}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
