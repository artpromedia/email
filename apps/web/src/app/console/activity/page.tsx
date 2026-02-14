"use client";

import { useState } from "react";
import {
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  MousePointer,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

type EventType =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "deferred"
  | "dropped"
  | "complained";

interface EmailEvent {
  id: string;
  message_id: string;
  to: string;
  subject: string;
  status: EventType;
  timestamp: string;
  from_domain: string;
  ip_address?: string;
  user_agent?: string;
  click_url?: string;
  bounce_reason?: string;
}

const STATUS_CONFIG: Record<EventType, { icon: React.ElementType; label: string; color: string }> =
  {
    delivered: {
      icon: CheckCircle2,
      label: "Delivered",
      color: "text-green-400 bg-green-500/10",
    },
    opened: {
      icon: Eye,
      label: "Opened",
      color: "text-purple-400 bg-purple-500/10",
    },
    clicked: {
      icon: MousePointer,
      label: "Clicked",
      color: "text-cyan-400 bg-cyan-500/10",
    },
    bounced: {
      icon: XCircle,
      label: "Bounced",
      color: "text-red-400 bg-red-500/10",
    },
    deferred: {
      icon: Clock,
      label: "Deferred",
      color: "text-yellow-400 bg-yellow-500/10",
    },
    dropped: {
      icon: AlertTriangle,
      label: "Dropped",
      color: "text-orange-400 bg-orange-500/10",
    },
    complained: {
      icon: AlertTriangle,
      label: "Complaint",
      color: "text-red-400 bg-red-500/10",
    },
  };

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Mock data
function generateMockEvents(): EmailEvent[] {
  const subjects = [
    "Welcome to OonruMail",
    "Password Reset",
    "Invoice #12345",
    "Your order has shipped",
    "Verify your email address",
    "Weekly Newsletter",
    "Account Activity Alert",
  ];
  const domains = ["myapp.com", "notifications.myapp.com"];
  const statuses: EventType[] = [
    "delivered",
    "delivered",
    "delivered",
    "opened",
    "opened",
    "clicked",
    "bounced",
    "deferred",
  ];

  return Array.from({ length: 25 }, (_, i) => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - i * 12 - Math.floor(Math.random() * 30));
    const status = statuses[i % statuses.length] ?? "delivered";
    return {
      id: `evt_${i}`,
      message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      to: `user${i + 1}@example.com`,
      subject: subjects[i % subjects.length] ?? "Welcome",
      status,
      timestamp: now.toISOString(),
      from_domain: domains[i % domains.length] ?? "example.com",
      ip_address: status === "opened" ? "203.0.113.42" : undefined,
      user_agent:
        status === "opened" ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" : undefined,
      click_url: status === "clicked" ? "https://myapp.com/verify?token=abc" : undefined,
      bounce_reason:
        status === "bounced"
          ? "550 5.1.1 The email account that you tried to reach does not exist"
          : undefined,
    };
  });
}

function EventRow({ event }: { event: EmailEvent }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[event.status];
  const Icon = config.icon;

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
      >
        <div className={`rounded-lg p-1.5 ${config.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{event.to}</span>
            <span className="shrink-0 text-xs text-gray-500">{timeAgo(event.timestamp)}</span>
          </div>
          <p className="truncate text-xs text-gray-500">{event.subject}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pl-14">
          <div className="space-y-1.5 rounded-lg bg-white/5 p-3 text-xs text-gray-400">
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-gray-500">Message ID:</span>
              <span className="font-mono">{event.message_id}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-gray-500">Timestamp:</span>
              <span>{new Date(event.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-gray-500">Domain:</span>
              <span>{event.from_domain}</span>
            </div>
            {event.ip_address && (
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-gray-500">IP:</span>
                <span>{event.ip_address}</span>
              </div>
            )}
            {event.user_agent && (
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-gray-500">Client:</span>
                <span className="truncate">{event.user_agent}</span>
              </div>
            )}
            {event.click_url && (
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-gray-500">Clicked:</span>
                <a
                  href={event.click_url}
                  className="flex items-center gap-1 text-blue-400 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {event.click_url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {event.bounce_reason && (
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-gray-500">Reason:</span>
                <span className="text-red-400">{event.bounce_reason}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsoleActivityPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [loading, setLoading] = useState(false);
  const events = generateMockEvents();

  const filtered = events.filter((e) => {
    if (filter !== "all" && e.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.to.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.message_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const refresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 600);
  };

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="mt-1 text-sm text-gray-400">Real-time email event log</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search and filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, subject, or message ID..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as EventType | "all")}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All events</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="bounced">Bounced</option>
          <option value="deferred">Deferred</option>
          <option value="dropped">Dropped</option>
        </select>
      </div>

      {/* Event list */}
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-4 font-semibold text-gray-300">No events found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {search || filter !== "all"
                ? "Try adjusting your search or filter"
                : "Events will appear here as you send emails"}
            </p>
          </div>
        ) : (
          filtered.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>

      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500">
          Showing {filtered.length} of {events.length} events
        </p>
      </div>
    </div>
  );
}
