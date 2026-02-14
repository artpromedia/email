"use client";

import { useState } from "react";
import {
  Webhook,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  TestTube,
  Copy,
  AlertTriangle,
} from "lucide-react";

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string;
  last_triggered_at?: string;
  success_count: number;
  failure_count: number;
  created_at: string;
}

const AVAILABLE_EVENTS = [
  { id: "email.sent", label: "Email Sent", description: "When an email is accepted for delivery" },
  {
    id: "email.delivered",
    label: "Delivered",
    description: "When an email is successfully delivered",
  },
  { id: "email.bounced", label: "Bounced", description: "When an email bounces (hard or soft)" },
  { id: "email.opened", label: "Opened", description: "When a recipient opens an email" },
  { id: "email.clicked", label: "Link Clicked", description: "When a recipient clicks a link" },
  { id: "email.complained", label: "Complaint", description: "When a recipient marks as spam" },
  { id: "email.unsubscribed", label: "Unsubscribed", description: "When a recipient unsubscribes" },
];

export default function ConsoleWebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(AVAILABLE_EVENTS.map((e) => e.id));
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const handleCreate = async () => {
    if (!formUrl.trim() || selectedEvents.length === 0) return;
    setCreating(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/console/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: formUrl.trim(),
          events: selectedEvents,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as WebhookEndpoint;
        setWebhooks((prev) => [data, ...prev]);
        setShowCreate(false);
        setFormUrl("");
        setSelectedEvents(AVAILABLE_EVENTS.map((e) => e.id));
      }
    } catch {
      // handle error
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook endpoint?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/v1/console/webhooks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // handle error
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/v1/console/webhooks/${id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // handle error
    } finally {
      setTimeout(() => setTesting(null), 1500);
    }
  };

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="mt-1 text-sm text-gray-400">
            Receive real-time notifications for email events
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Add Endpoint
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="mb-4 font-semibold">Add webhook endpoint</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="webhook-url" className="mb-1 block text-sm text-gray-400">
                Endpoint URL
              </label>
              <input
                id="webhook-url"
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://yourapp.com/webhooks/oonrumail"
                className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-gray-400">Events</p>
                <button
                  onClick={() =>
                    setSelectedEvents(
                      selectedEvents.length === AVAILABLE_EVENTS.length
                        ? []
                        : AVAILABLE_EVENTS.map((e) => e.id)
                    )
                  }
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {selectedEvents.length === AVAILABLE_EVENTS.length
                    ? "Deselect all"
                    : "Select all"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {AVAILABLE_EVENTS.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => toggleEvent(event.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      selectedEvents.includes(event.id)
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          selectedEvents.includes(event.id)
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-600"
                        }`}
                      >
                        {selectedEvents.includes(event.id) && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <span className="font-mono text-sm font-medium">{event.id}</span>
                    </div>
                    <p className="ml-6 mt-1 text-xs text-gray-500">{event.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !formUrl.trim() || selectedEvents.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Add Endpoint"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setFormUrl("");
                }}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook list */}
      <div className="mt-6 space-y-3">
        {webhooks.length === 0 && !showCreate && (
          <div className="rounded-xl border border-dashed border-white/20 p-12 text-center">
            <Webhook className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">No webhook endpoints</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add an endpoint to receive real-time event notifications
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              Add your first endpoint
            </button>
          </div>
        )}

        {webhooks.map((webhook) => (
          <div key={webhook.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    webhook.is_active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <span className="truncate font-mono text-sm">{webhook.url}</span>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleTest(webhook.id)}
                  disabled={testing === webhook.id}
                  className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                  title="Send test event"
                >
                  <TestTube
                    className={`h-4 w-4 ${testing === webhook.id ? "animate-pulse text-green-400" : ""}`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(webhook.id)}
                  className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {webhook.events.map((event) => (
                <span
                  key={event}
                  className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-gray-400"
                >
                  {event}
                </span>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-400" />
                {webhook.success_count.toLocaleString()} delivered
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-400" />
                {webhook.failure_count.toLocaleString()} failed
              </span>
              {webhook.last_triggered_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last triggered {new Date(webhook.last_triggered_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Signing secret */}
            <div className="mt-3 rounded-lg bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Signing secret:</span>
                <button
                  onClick={() => navigator.clipboard.writeText(webhook.secret)}
                  className="flex items-center gap-1 text-xs text-gray-400 transition hover:text-white"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
              <p className="mt-1 font-mono text-xs text-gray-400">whsec_•••••••••••••••</p>
            </div>
          </div>
        ))}
      </div>

      {/* Webhook payload example */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
          <div>
            <h3 className="text-sm font-semibold">Webhook payload format</h3>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-xs text-gray-300">
              {`{
  "id": "evt_abc123",
  "type": "email.delivered",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "message_id": "msg_xyz789",
    "to": "user@example.com",
    "from": "hello@yourdomain.com",
    "subject": "Welcome!",
    "metadata": { "user_id": "123" }
  }
}`}
            </pre>
            <p className="mt-2 text-xs text-gray-500">
              Verify webhook signatures using your signing secret with HMAC-SHA256. See our{" "}
              <a href="/docs/webhooks" className="text-blue-400 hover:underline">
                webhook documentation
              </a>{" "}
              for details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
