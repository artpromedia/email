"use client";

/**
 * Admin Dashboard - Real-time overview of email platform
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Users,
  Globe,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
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

interface DashboardStats {
  totalEmails: number;
  emailsToday: number;
  activeUsers: number;
  activeDomains: number;
  pendingDomains: number;
  deliveryRate: number;
  bounceRate: number;
  queueSize: number;
}

interface Domain {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended";
  emailCount: number;
  userCount: number;
}

interface Alert {
  id: string;
  type: "warning" | "error" | "info" | "success";
  message: string;
  timestamp: string;
}

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  responseTime: number;
}

const API_BASE = "/api/v1";

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch aggregated stats from server-side proxy
      const statsRes = await fetch(`${API_BASE}/stats`);
      if (statsRes.ok) {
        const statsData = (await statsRes.json()) as {
          domains?: Domain[];
          totalEmails?: number;
          emailsToday?: number;
          activeUsers?: number;
          activeDomains?: number;
          deliveryRate?: number;
          bounceRate?: number;
          recentAlerts?: Alert[];
        };
        setDomains(statsData.domains ?? []);
        setStats({
          totalEmails: statsData.totalEmails ?? 0,
          emailsToday: statsData.emailsToday ?? 0,
          activeUsers: statsData.activeUsers ?? 0,
          activeDomains: statsData.activeDomains ?? 0,
          pendingDomains: 0,
          deliveryRate: statsData.deliveryRate ?? 0,
          bounceRate: statsData.bounceRate ?? 0,
          queueSize: 0,
        });
        setAlerts(statsData.recentAlerts ?? []);
      }

      // Fetch service health via server-side proxy (avoids browser CORS issues)
      const healthRes = await fetch(`${API_BASE}/health`);
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as { services?: ServiceHealth[] };
        setServices(healthData.services ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardData();
    const interval = setInterval(() => void fetchDashboardData(), 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "degraded":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "down":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Platform overview and real-time metrics
          </p>
        </div>
        <Button onClick={fetchDashboardData} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEmails.toLocaleString() ?? "0"}</div>
            <p className="flex items-center text-xs text-gray-500">
              <TrendingUp className="mr-1 h-3 w-3 text-green-500" />+
              {stats?.emailsToday.toLocaleString() ?? "0"} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeUsers.toLocaleString() ?? "0"}</div>
            <p className="text-xs text-gray-500">Across all domains</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <Activity className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.deliveryRate ?? 0}%</div>
            <p className="flex items-center text-xs text-gray-500">
              {stats && stats.bounceRate > 1 ? (
                <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
              ) : (
                <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              )}
              Bounce rate: {stats?.bounceRate ?? 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Domains</CardTitle>
            <Globe className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeDomains ?? 0}</div>
            <p className="text-xs text-gray-500">
              {stats?.pendingDomains ?? 0} pending verification
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Domains List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Domains</CardTitle>
                <CardDescription>Managed email domains</CardDescription>
              </div>
              <Link href="/admin/domains">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {domains.length === 0 ? (
                <p className="py-4 text-center text-gray-500">No domains configured</p>
              ) : (
                domains.slice(0, 5).map((domain) => (
                  <div
                    key={domain.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{domain.name}</span>
                        <Badge
                          variant={
                            domain.status === "active"
                              ? "default"
                              : domain.status === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {domain.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        {domain.emailCount.toLocaleString()} emails • {domain.userCount} users
                      </p>
                    </div>
                    <Link href={`/admin/domains/${domain.id}`}>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Service Health */}
        <Card>
          <CardHeader>
            <CardTitle>Service Health</CardTitle>
            <CardDescription>Real-time service status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(service.status)}
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        service.status === "healthy"
                          ? "default"
                          : service.status === "degraded"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {service.status}
                    </Badge>
                    {service.responseTime > 0 && (
                      <p className="mt-1 text-xs text-gray-500">{service.responseTime}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
            <CardDescription>System notifications and warnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <p className="py-4 text-center text-gray-500">No recent alerts</p>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-4 rounded-lg border p-4">
                    <AlertTriangle
                      className={`h-5 w-5 flex-shrink-0 ${
                        alert.type === "warning"
                          ? "text-yellow-500"
                          : alert.type === "error"
                            ? "text-red-500"
                            : alert.type === "success"
                              ? "text-green-500"
                              : "text-blue-500"
                      }`}
                    />
                    <div className="flex-1">
                      <p className="text-sm">{alert.message}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
