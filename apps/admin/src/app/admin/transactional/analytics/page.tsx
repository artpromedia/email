"use client";

/**
 * Transactional Email - Analytics Dashboard
 * Delivery stats, bounce rates, engagement metrics, and reputation monitoring
 */

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  TrendingDown,
  Send,
  CheckCircle,
  XCircle,
  Eye,
  MousePointerClick,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@email/ui";

const API_BASE = "/api/v1/transactional";

interface OverviewStats {
  total_sent?: number;
  total_delivered?: number;
  total_bounced?: number;
  total_opened?: number;
  total_clicked?: number;
  total_complaints?: number;
  delivery_rate?: number;
  bounce_rate?: number;
  open_rate?: number;
  click_rate?: number;
  complaint_rate?: number;
}

interface TimeseriesPoint {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

interface BounceBreakdown {
  type: string;
  count: number;
  percentage: number;
}

interface DomainStats {
  domain: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [bounces, setBounces] = useState<BounceBreakdown[]>([]);
  const [domains, setDomains] = useState<DomainStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("7d");

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewRes, timeseriesRes, bouncesRes, domainsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/analytics/overview?period=${period}`),
        fetch(`${API_BASE}/analytics/timeseries?period=${period}&interval=day`),
        fetch(`${API_BASE}/analytics/bounces?period=${period}`),
        fetch(`${API_BASE}/analytics/domains?period=${period}`),
      ]);

      // Overview
      if (overviewRes.status === "fulfilled" && overviewRes.value.ok) {
        const data = (await overviewRes.value.json()) as OverviewStats | null;
        setOverview(data ?? null);
      }

      // Timeseries
      if (timeseriesRes.status === "fulfilled" && timeseriesRes.value.ok) {
        const data = (await timeseriesRes.value.json()) as
          | TimeseriesPoint[]
          | { data?: TimeseriesPoint[] }
          | null;
        if (Array.isArray(data)) setTimeseries(data);
        else if (data && typeof data === "object") setTimeseries(data.data ?? []);
      }

      // Bounces
      if (bouncesRes.status === "fulfilled" && bouncesRes.value.ok) {
        const data = (await bouncesRes.value.json()) as
          | BounceBreakdown[]
          | { data?: BounceBreakdown[] }
          | null;
        if (Array.isArray(data)) setBounces(data);
        else if (data && typeof data === "object") setBounces(data.data ?? []);
      }

      // Domains
      if (domainsRes.status === "fulfilled" && domainsRes.value.ok) {
        const data = (await domainsRes.value.json()) as
          | DomainStats[]
          | { data?: DomainStats[] }
          | null;
        if (Array.isArray(data)) setDomains(data);
        else if (data && typeof data === "object") setDomains(data.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const formatPct = (value?: number) => (value != null ? `${(value * 100).toFixed(1)}%` : "—");
  const formatNum = (value?: number) => (value != null ? value.toLocaleString() : "—");

  const statCards = [
    {
      label: "Total Sent",
      value: formatNum(overview?.total_sent),
      icon: Send,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "Delivered",
      value: formatNum(overview?.total_delivered),
      sub: formatPct(overview?.delivery_rate),
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "Bounced",
      value: formatNum(overview?.total_bounced),
      sub: formatPct(overview?.bounce_rate),
      icon: XCircle,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-950",
    },
    {
      label: "Opened",
      value: formatNum(overview?.total_opened),
      sub: formatPct(overview?.open_rate),
      icon: Eye,
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-950",
    },
    {
      label: "Clicked",
      value: formatNum(overview?.total_clicked),
      sub: formatPct(overview?.click_rate),
      icon: MousePointerClick,
      color: "text-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-950",
    },
    {
      label: "Complaints",
      value: formatNum(overview?.total_complaints),
      sub: formatPct(overview?.complaint_rate),
      icon: TrendingDown,
      color: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-950",
    },
  ];

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

      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-500">Time period:</span>
          {["24h", "7d", "30d", "90d"].map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchAnalytics()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : !overview ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <BarChart3 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <div className="text-lg font-medium">No analytics data available</div>
            <div className="mt-1 text-sm">
              Analytics will appear here once emails are sent through the transactional API.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {statCards.map((card) => (
              <Card key={card.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${card.bg}`}>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{card.label}</div>
                      <div className="text-xl font-bold">{card.value}</div>
                      {card.sub && <div className="text-xs text-gray-400">{card.sub}</div>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Timeseries chart (simple bar-style visualization) */}
          {timeseries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Trend</CardTitle>
                <CardDescription>Daily email volume over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1" style={{ height: "180px" }}>
                  {(() => {
                    const maxSent = Math.max(...timeseries.map((d) => d.sent), 1);
                    return timeseries.map((point, idx) => (
                      <div
                        key={idx}
                        className="group relative flex flex-1 flex-col items-center"
                        style={{ height: "100%" }}
                      >
                        <div className="flex-1" />
                        <div
                          className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
                          style={{
                            height: `${(point.sent / maxSent) * 100}%`,
                            minHeight: point.sent > 0 ? "4px" : "0px",
                          }}
                        />
                        <div
                          className="absolute bottom-full mb-1 hidden rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {new Date(point.date).toLocaleDateString()}: {point.sent} sent,{" "}
                          {point.delivered} delivered
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>
                    {timeseries[0] ? new Date(timeseries[0].date).toLocaleDateString() : ""}
                  </span>
                  <span>
                    {(() => {
                      const last = timeseries[timeseries.length - 1];
                      return last ? new Date(last.date).toLocaleDateString() : "";
                    })()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Two-column: Bounce breakdown + Domain stats */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Bounce breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Bounce Breakdown</CardTitle>
                <CardDescription>Distribution of bounce types</CardDescription>
              </CardHeader>
              <CardContent>
                {bounces.length === 0 ? (
                  <div className="py-6 text-center text-gray-500">No bounce data</div>
                ) : (
                  <div className="space-y-3">
                    {bounces.map((b) => (
                      <div key={b.type}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">{b.type}</span>
                          <span className="text-gray-500">
                            {b.count} ({(b.percentage * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${b.percentage * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Domain stats */}
            <Card>
              <CardHeader>
                <CardTitle>Sending Domains</CardTitle>
                <CardDescription>Per-domain delivery statistics</CardDescription>
              </CardHeader>
              <CardContent>
                {domains.length === 0 ? (
                  <div className="py-6 text-center text-gray-500">No domain data</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-4">Domain</th>
                          <th className="pb-2 pr-4">Sent</th>
                          <th className="pb-2 pr-4">Delivered</th>
                          <th className="pb-2 pr-4">Bounced</th>
                          <th className="pb-2">Opened</th>
                        </tr>
                      </thead>
                      <tbody>
                        {domains.map((d) => (
                          <tr key={d.domain} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{d.domain}</td>
                            <td className="py-2 pr-4">{d.sent.toLocaleString()}</td>
                            <td className="py-2 pr-4">{d.delivered.toLocaleString()}</td>
                            <td className="py-2 pr-4">{d.bounced.toLocaleString()}</td>
                            <td className="py-2">{d.opened.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
