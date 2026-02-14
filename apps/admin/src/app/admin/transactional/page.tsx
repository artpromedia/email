"use client";

/**
 * Transactional Email - Overview Page
 * Shows API keys, templates count, webhook status, and recent activity
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Key,
  FileText,
  Webhook,
  ShieldBan,
  RefreshCw,
  ArrowRight,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@email/ui";

const API_BASE = "/api/v1/transactional";

interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  created_at: string;
}

interface OverviewStats {
  total_sent: number;
  total_delivered: number;
  total_bounced: number;
  total_opened: number;
  total_clicked: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export default function TransactionalOverviewPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [keysRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api-keys`),
        fetch(`${API_BASE}/analytics/overview`),
      ]);

      if (keysRes.status === "fulfilled" && keysRes.value.ok) {
        const keysData = (await keysRes.value.json()) as {
          data?: ApiKeyInfo[];
        } | null;
        setApiKeys(keysData?.data ?? []);
      }

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = (await statsRes.value.json()) as OverviewStats | null;
        if (statsData) setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

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

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_sent?.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.delivery_rate ? `${(stats.delivery_rate * 100).toFixed(1)}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.total_delivered?.toLocaleString() ?? 0} messages
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounced</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.bounce_rate ? `${(stats.bounce_rate * 100).toFixed(1)}%` : "0%"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.total_bounced?.toLocaleString() ?? 0} messages
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.open_rate ? `${(stats.open_rate * 100).toFixed(1)}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.total_opened?.toLocaleString() ?? 0} opens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/transactional/api-keys">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Keys</CardTitle>
              <Key className="h-5 w-5 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{apiKeys.length}</div>
              <p className="flex items-center text-xs text-muted-foreground">
                Manage API keys
                <ArrowRight className="ml-1 h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/transactional/templates">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Templates</CardTitle>
              <FileText className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="flex items-center text-xs text-muted-foreground">
                Manage templates
                <ArrowRight className="ml-1 h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/transactional/webhooks">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Webhooks</CardTitle>
              <Webhook className="h-5 w-5 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="flex items-center text-xs text-muted-foreground">
                Manage webhooks
                <ArrowRight className="ml-1 h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/transactional/suppressions">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suppressions</CardTitle>
              <ShieldBan className="h-5 w-5 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="flex items-center text-xs text-muted-foreground">
                Manage suppressions
                <ArrowRight className="ml-1 h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* API Keys Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Active API keys for sending transactional emails</CardDescription>
            </div>
            <Link href="/admin/transactional/api-keys">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No API keys created yet.{" "}
              <Link href="/admin/transactional/api-keys" className="text-blue-600 underline">
                Create one
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.slice(0, 5).map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-gray-500" />
                    <div>
                      <span className="font-medium">{key.name}</span>
                      <span className="ml-2 font-mono text-sm text-gray-500">
                        {key.key_prefix}...
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.scopes.slice(0, 3).map((scope) => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                    {key.scopes.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{key.scopes.length - 3}
                      </Badge>
                    )}
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
