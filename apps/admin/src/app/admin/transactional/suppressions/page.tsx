"use client";

/**
 * Transactional Email - Suppressions Management
 * View and manage suppressed email addresses (bounces, complaints, unsubscribes, manual)
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldOff,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Download,
  AlertTriangle,
  Ban,
  Mail,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  bounce: {
    label: "Bounce",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
  hard_bounce: {
    label: "Hard Bounce",
    color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
  soft_bounce: {
    label: "Soft Bounce",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  },
  complaint: {
    label: "Complaint",
    color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
  spam: { label: "Spam", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  unsubscribe: {
    label: "Unsubscribed",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
  manual: {
    label: "Manual",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  invalid: {
    label: "Invalid",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  },
};

interface Suppression {
  id?: string;
  email: string;
  reason: string;
  bounce_class?: string;
  source?: string;
  expires_at?: string;
  created_at: string;
}

export default function SuppressionsPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);

  // Add form
  const [addEmail, setAddEmail] = useState("");
  const [addReason, setAddReason] = useState("manual");

  const fetchSuppressions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = searchQuery
        ? `${API_BASE}/suppressions?email=${encodeURIComponent(searchQuery)}`
        : `${API_BASE}/suppressions`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404 || res.status === 500) {
          setSuppressions([]);
          return;
        }
        throw new Error("Failed to fetch suppressions");
      }
      const data = (await res.json()) as
        | Suppression[]
        | { data?: Suppression[]; suppressions?: Suppression[] }
        | null;
      if (Array.isArray(data)) {
        setSuppressions(data);
      } else if (data && typeof data === "object") {
        setSuppressions(data.data ?? data.suppressions ?? []);
      } else {
        setSuppressions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch suppressions");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    void fetchSuppressions();
  }, [fetchSuppressions]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    try {
      setAdding(true);
      const res = await fetch(`${API_BASE}/suppressions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail.trim().toLowerCase(),
          reason: addReason,
          source: "admin",
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add suppression");
      }
      setShowAddDialog(false);
      setAddEmail("");
      setAddReason("manual");
      void fetchSuppressions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add suppression");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (
      !confirm(
        `Remove "${email}" from suppression list? This will allow emails to this address again.`
      )
    )
      return;
    try {
      const res = await fetch(`${API_BASE}/suppressions/${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove suppression");
      void fetchSuppressions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove suppression");
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/suppressions?format=csv`);
      if (!res.ok) throw new Error("Failed to export");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suppressions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const getReasonBadge = (reason: string) => {
    const info = REASON_LABELS[reason] ?? {
      label: reason,
      color: "bg-gray-100 text-gray-600",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}
      >
        {info.label}
      </span>
    );
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Total Suppressed",
            value: suppressions.length,
            icon: ShieldOff,
            color: "text-red-500",
          },
          {
            label: "Bounces",
            value: suppressions.filter(
              (s) =>
                s.reason === "bounce" || s.reason === "hard_bounce" || s.reason === "soft_bounce"
            ).length,
            icon: AlertTriangle,
            color: "text-orange-500",
          },
          {
            label: "Complaints",
            value: suppressions.filter((s) => s.reason === "complaint" || s.reason === "spam")
              .length,
            icon: Ban,
            color: "text-red-500",
          },
          {
            label: "Manual",
            value: suppressions.filter((s) => s.reason === "manual").length,
            icon: Mail,
            color: "text-gray-500",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Suppression List</CardTitle>
              <CardDescription>
                Email addresses that will not receive transactional emails
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Suppression
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Email to Suppression List</DialogTitle>
                    <DialogDescription>
                      This email address will be blocked from receiving transactional emails.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="supp-email">Email Address</Label>
                      <Input
                        id="supp-email"
                        type="email"
                        placeholder="user@example.com"
                        value={addEmail}
                        onChange={(e) => setAddEmail(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="supp-reason">Reason</Label>
                      <select
                        id="supp-reason"
                        value={addReason}
                        onChange={(e) => setAddReason(e.target.value)}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="manual">Manual block</option>
                        <option value="bounce">Bounce</option>
                        <option value="complaint">Complaint</option>
                        <option value="unsubscribe">Unsubscribe</option>
                        <option value="invalid">Invalid address</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAdd} disabled={adding || !addEmail.trim()}>
                      {adding ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add to Suppression List"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by email..."
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
          ) : suppressions.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {searchQuery
                ? "No suppressed emails match your search"
                : "No suppressions. All email addresses can receive transactional emails."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Reason</th>
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Expires</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map((supp, idx) => (
                    <tr key={supp.id ?? `${supp.email}-${idx}`} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{supp.email}</td>
                      <td className="py-3 pr-4">{getReasonBadge(supp.reason)}</td>
                      <td className="py-3 pr-4 text-gray-500">{supp.source ?? "—"}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {new Date(supp.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        {supp.expires_at ? new Date(supp.expires_at).toLocaleDateString() : "Never"}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemove(supp.email)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
