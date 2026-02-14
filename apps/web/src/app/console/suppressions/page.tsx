"use client";

import { useState } from "react";
import {
  Ban,
  Plus,
  Trash2,
  Upload,
  Download,
  Search,
  AlertTriangle,
  Mail,
  Clock,
} from "lucide-react";

type SuppressionReason = "bounce" | "complaint" | "unsubscribe" | "manual";

interface Suppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string;
  created_at: string;
}

const REASON_CONFIG: Record<SuppressionReason, { label: string; color: string }> = {
  bounce: { label: "Bounced", color: "bg-red-500/10 text-red-400" },
  complaint: { label: "Complaint", color: "bg-orange-500/10 text-orange-400" },
  unsubscribe: {
    label: "Unsubscribed",
    color: "bg-yellow-500/10 text-yellow-400",
  },
  manual: { label: "Manual", color: "bg-gray-500/10 text-gray-400" },
};

export default function ConsoleSuppressionsPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SuppressionReason | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEmails, setBulkEmails] = useState("");

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/console/suppressions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: addEmail.trim(),
          reason: "manual",
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as Suppression;
        setSuppressions((prev) => [data, ...prev]);
        setAddEmail("");
        setShowAdd(false);
      }
    } catch {
      // handle error
    } finally {
      setAdding(false);
    }
  };

  const handleBulkAdd = async () => {
    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/console/suppressions/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emails, reason: "manual" }),
      });

      if (res.ok) {
        const data = (await res.json()) as { added: Suppression[] };
        setSuppressions((prev) => [...data.added, ...prev]);
        setBulkEmails("");
        setShowBulk(false);
      }
    } catch {
      // handle error
    }
  };

  const handleRemove = async (id: string) => {
    if (
      !confirm(
        "Remove this email from suppression list? They will be able to receive emails again."
      )
    )
      return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/v1/console/suppressions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuppressions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // handle error
    }
  };

  const handleExport = () => {
    const csv = [
      "email,reason,source,created_at",
      ...suppressions.map((s) => `${s.email},${s.reason},${s.source},${s.created_at}`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppressions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = suppressions.filter((s) => {
    if (filter !== "all" && s.reason !== filter) return false;
    if (search) return s.email.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppressions</h1>
          <p className="mt-1 text-sm text-gray-400">
            Manage bounced and unsubscribed email addresses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
          >
            <Upload className="h-4 w-4" />
            Bulk Add
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Add single email */}
      {showAdd && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="mb-3 font-semibold">Add to suppression list</h3>
          <div className="flex gap-3">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !addEmail.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setAddEmail("");
              }}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk add */}
      {showBulk && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="mb-3 font-semibold">Bulk add suppressions</h3>
          <p className="mb-3 text-sm text-gray-400">
            Enter email addresses separated by commas, semicolons, or new lines
          </p>
          <textarea
            value={bulkEmails}
            onChange={(e) => setBulkEmails(e.target.value)}
            rows={6}
            placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
            className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={handleBulkAdd}
              disabled={!bulkEmails.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              Add {bulkEmails.split(/[\n,;]+/).filter((e) => e.trim()).length} email(s)
            </button>
            <button
              onClick={() => {
                setShowBulk(false);
                setBulkEmails("");
              }}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search and filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as SuppressionReason | "all")}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All reasons</option>
          <option value="bounce">Bounced</option>
          <option value="complaint">Complaint</option>
          <option value="unsubscribe">Unsubscribed</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {/* Suppression list */}
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Ban className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">
              {suppressions.length === 0 ? "Suppression list is empty" : "No matches found"}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {suppressions.length === 0
                ? "Bounced and unsubscribed addresses will appear here automatically"
                : "Try adjusting your search or filter"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((suppression) => {
              const config = REASON_CONFIG[suppression.reason];
              return (
                <div
                  key={suppression.id}
                  className="flex items-center justify-between px-4 py-3 transition hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Mail className="h-4 w-4 shrink-0 text-gray-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{suppression.email}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${config.color}`}
                        >
                          {config.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {new Date(suppression.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(suppression.id)}
                    className="ml-3 shrink-0 rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
                    title="Remove from suppression list"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {suppressions.length > 0 && (
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Showing {filtered.length} of {suppressions.length} suppressed emails
          </p>
        </div>
      )}

      {/* Info */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
          <div>
            <h3 className="text-sm font-semibold">About the suppression list</h3>
            <ul className="ml-4 mt-2 list-disc space-y-1 text-sm text-gray-400">
              <li>Hard bounces and spam complaints are automatically added</li>
              <li>Emails to suppressed addresses will be silently dropped</li>
              <li>
                Removing an email allows future sends but won&apos;t change their unsubscribe
                preference
              </li>
              <li>Maintaining a clean list improves your sender reputation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
