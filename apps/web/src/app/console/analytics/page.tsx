"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Mail,
  CheckCircle2,
  XCircle,
  MousePointer,
  Eye,
  RefreshCw,
} from "lucide-react";

type TimeRange = "24h" | "7d" | "30d" | "90d";

interface StatsOverview {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complaints: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

interface DailyDataPoint {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

// Mock chart bar component
function BarChartViz({ data, maxVal }: { data: DailyDataPoint[]; maxVal: number }) {
  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((point) => (
        <div key={point.date} className="group relative flex flex-1 flex-col items-center gap-1">
          <div className="absolute -top-10 z-10 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
            {point.date}: {point.sent.toLocaleString()} sent
          </div>
          <div
            className="min-h-[2px] w-full rounded-t bg-blue-500/80 transition hover:bg-blue-400"
            style={{ height: `${(point.sent / maxVal) * 100}%` }}
          />
          <div
            className="min-h-[1px] w-full rounded-t bg-green-500/60"
            style={{ height: `${(point.delivered / maxVal) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  change?: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        {change !== undefined && (
          <div
            className={`flex items-center gap-1 text-xs ${change >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {change >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

export default function ConsoleAnalyticsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [loading, setLoading] = useState(false);

  // Placeholder data — in production, fetch from /api/v1/console/analytics
  const stats: StatsOverview = {
    sent: 12847,
    delivered: 12641,
    opened: 4232,
    clicked: 1891,
    bounced: 206,
    complaints: 3,
    delivery_rate: 98.4,
    open_rate: 33.5,
    click_rate: 14.7,
    bounce_rate: 1.6,
  };

  const [dailyData] = useState<DailyDataPoint[]>(() => {
    const sentValues = [1842, 2105, 1567, 1923, 2341, 1688, 2011];
    return sentValues.map((sent, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sent,
        delivered: Math.floor(sent * 0.985),
        opened: Math.floor(sent * 0.33),
        clicked: Math.floor(sent * 0.15),
        bounced: Math.floor(sent * 0.015),
      };
    });
  });

  const maxVal = Math.max(...dailyData.map((d) => d.sent));

  const ranges: { value: TimeRange; label: string }[] = [
    { value: "24h", label: "24h" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
  ];

  const refresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div className="max-w-6xl p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-gray-400">Email delivery metrics and performance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {ranges.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-sm transition ${
                  range === r.value
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Emails sent"
          value={stats.sent.toLocaleString()}
          change={12}
          icon={Mail}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Delivered"
          value={`${stats.delivery_rate}%`}
          change={0.3}
          icon={CheckCircle2}
          color="bg-green-500/10 text-green-400"
        />
        <StatCard
          label="Open rate"
          value={`${stats.open_rate}%`}
          change={-2.1}
          icon={Eye}
          color="bg-purple-500/10 text-purple-400"
        />
        <StatCard
          label="Click rate"
          value={`${stats.click_rate}%`}
          change={1.5}
          icon={MousePointer}
          color="bg-cyan-500/10 text-cyan-400"
        />
      </div>

      {/* Chart */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            Email volume
          </h3>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-blue-500" />
              Sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-green-500/60" />
              Delivered
            </span>
          </div>
        </div>
        <BarChartViz data={dailyData} maxVal={maxVal} />
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          {dailyData.map((d) => (
            <span key={d.date}>{d.date}</span>
          ))}
        </div>
      </div>

      {/* Detailed breakdown */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Delivery stats */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 font-semibold">Delivery breakdown</h3>
          <div className="space-y-3">
            {[
              {
                label: "Delivered",
                value: stats.delivered,
                pct: stats.delivery_rate,
                color: "bg-green-500",
              },
              {
                label: "Bounced",
                value: stats.bounced,
                pct: stats.bounce_rate,
                color: "bg-red-500",
              },
              {
                label: "Complaints",
                value: stats.complaints,
                pct: (stats.complaints / stats.sent) * 100,
                color: "bg-yellow-500",
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-gray-400">{item.label}</span>
                  <span>
                    {item.value.toLocaleString()}{" "}
                    <span className="text-gray-500">({item.pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.min(item.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Engagement stats */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 font-semibold">Engagement</h3>
          <div className="space-y-3">
            {[
              {
                label: "Opened",
                value: stats.opened,
                pct: stats.open_rate,
                color: "bg-purple-500",
              },
              {
                label: "Clicked",
                value: stats.clicked,
                pct: stats.click_rate,
                color: "bg-cyan-500",
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-gray-400">{item.label}</span>
                  <span>
                    {item.value.toLocaleString()}{" "}
                    <span className="text-gray-500">({item.pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.min(item.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg bg-white/5 p-4">
            <p className="text-xs text-gray-500">
              Engagement rates are calculated based on delivered emails. Open tracking requires HTML
              emails with tracking pixel enabled. Click tracking requires link rewriting to be
              enabled in your sending settings.
            </p>
          </div>
        </div>
      </div>

      {/* Bounce details */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <h3 className="font-semibold">Bounce details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-right font-medium">Count</th>
                <th className="py-2 text-right font-medium">% of sends</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-white/5">
                <td className="py-2">Hard bounce</td>
                <td className="text-right">142</td>
                <td className="text-right text-red-400">1.1%</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Soft bounce</td>
                <td className="text-right">58</td>
                <td className="text-right text-yellow-400">0.5%</td>
              </tr>
              <tr>
                <td className="py-2">Block</td>
                <td className="text-right">6</td>
                <td className="text-right text-gray-500">0.05%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
