"use client";

import { useState } from "react";
import {
  Globe,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

interface Domain {
  id: string;
  name: string;
  status: "pending_verification" | "verified" | "failed";
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  created_at: string;
  dns_records: DnsRecord[];
}

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  verified: boolean;
}

function StatusIcon({ verified }: { verified: boolean }) {
  return verified ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : (
    <Clock className="h-4 w-4 text-yellow-500" />
  );
}

function DomainCard({ domain, onVerify }: { domain: Domain; onVerify: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const allVerified =
    domain.mx_verified && domain.spf_verified && domain.dkim_verified && domain.dmarc_verified;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-gray-500" />
            <div>
              <h3 className="font-semibold">{domain.name}</h3>
              <p className="text-xs text-gray-500">
                Added {new Date(domain.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allVerified ? (
              <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
                <Clock className="h-3 w-3" /> Pending
              </span>
            )}
          </div>
        </div>

        {/* DNS Status grid */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {(
            [
              ["MX", domain.mx_verified],
              ["SPF", domain.spf_verified],
              ["DKIM", domain.dkim_verified],
              ["DMARC", domain.dmarc_verified],
            ] as const
          ).map(([label, verified]) => (
            <div key={label} className="flex items-center gap-1.5 text-sm">
              <StatusIcon verified={verified} />
              <span className={verified ? "text-green-400" : "text-gray-400"}>{label}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          {!allVerified && (
            <button
              onClick={() => onVerify(domain.id)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium transition hover:bg-blue-500"
            >
              <RefreshCw className="h-3 w-3" />
              Verify DNS
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20"
          >
            DNS Records
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* DNS Records detail */}
      {expanded && (
        <div className="border-t border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 text-xs text-gray-400">
            Add these DNS records to your domain&apos;s DNS provider:
          </p>
          <div className="space-y-3">
            {domain.dns_records.map((rec, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-gray-950 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                      {rec.type}
                    </span>
                    <StatusIcon verified={rec.verified} />
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(rec.value)}
                    className="text-gray-500 transition hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-gray-500">Host: </span>
                  <span className="font-mono text-gray-300">{rec.host}</span>
                </div>
                <div className="mt-0.5 text-xs">
                  <span className="text-gray-500">Value: </span>
                  <span className="break-all font-mono text-gray-300">{rec.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsoleDomainsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/admin/domains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newDomain.trim().toLowerCase() }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, string>;
        throw new Error(data["message"] ?? `Failed (${res.status})`);
      }

      const domain = (await res.json()) as Domain;
      setDomains((prev) => [...prev, domain]);
      setNewDomain("");
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/v1/admin/domains/${id}/verify-dns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = (await res.json()) as Domain;
        setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
      }
    } catch {
      // silently handle
    }
  };

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sending Domains</h1>
          <p className="mt-1 text-sm text-gray-400">Add and verify domains to send email from</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Add Domain
        </button>
      </div>

      {/* Add domain form */}
      {showAdd && (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h3 className="font-semibold">Add a sending domain</h3>
          <p className="mt-1 text-sm text-gray-400">
            Enter the domain you want to send email from (e.g., myapp.com)
          </p>
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            />
            <button
              onClick={handleAddDomain}
              disabled={adding || !newDomain.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setNewDomain("");
                setError("");
              }}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1 text-sm text-red-400">
              <XCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      )}

      {/* Domain list */}
      <div className="mt-6 space-y-4">
        {domains.length === 0 && !showAdd && (
          <div className="rounded-xl border border-dashed border-white/20 p-12 text-center">
            <Globe className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">No domains yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add a domain to start sending transactional emails
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
            >
              Add your first domain
            </button>
          </div>
        )}
        {domains.map((domain) => (
          <DomainCard key={domain.id} domain={domain} onVerify={handleVerify} />
        ))}
      </div>

      {/* Help text */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold">Domain verification guide</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-400">
              After adding a domain, you&apos;ll need to add DNS records to verify ownership and
              enable email delivery. Add the MX, SPF, DKIM, and DMARC records shown below each
              domain to your DNS provider. Verification usually completes within a few minutes, but
              DNS propagation can take up to 48 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
