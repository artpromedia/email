"use client";

/**
 * Admin Settings Page
 * System-wide configuration for the email platform
 */

import { useCallback, useEffect, useState } from "react";
import { Settings, Server, Mail, Shield, Database, Bell, Save, RefreshCw } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
} from "@email/ui";

interface SystemSettings {
  smtp: {
    maxMessageSize: number;
    maxRecipients: number;
    rateLimit: number;
    requireTls: boolean;
  };
  security: {
    enforceSpf: boolean;
    enforceDkim: boolean;
    enforceDmarc: boolean;
    quarantineThreshold: number;
  };
  retention: {
    emailRetentionDays: number;
    logsRetentionDays: number;
    backupEnabled: boolean;
  };
  notifications: {
    adminAlerts: boolean;
    bounceNotifications: boolean;
    quotaWarnings: boolean;
  };
}

const API_BASE = "/api/v1";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    smtp: {
      maxMessageSize: 25,
      maxRecipients: 100,
      rateLimit: 1000,
      requireTls: true,
    },
    security: {
      enforceSpf: true,
      enforceDkim: true,
      enforceDmarc: true,
      quarantineThreshold: 50,
    },
    retention: {
      emailRetentionDays: 365,
      logsRetentionDays: 90,
      backupEnabled: true,
    },
    notifications: {
      adminAlerts: true,
      bounceNotifications: true,
      quotaWarnings: true,
    },
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState({
    version: "—",
    environment: "—",
    database: "checking...",
    queue: "checking...",
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch settings from API
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = (await res.json()) as SystemSettings;
        setSettings(data);
      }

      // Fetch health info for server status
      const healthRes = await fetch(`${API_BASE}/health`);
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as {
          services?: { name: string; status: string }[];
        };
        const services = healthData.services ?? [];
        const allHealthy = services.every((s) => s.status === "healthy");
        const dbService = services.find(
          (s) => s.name.toLowerCase().includes("auth") || s.name.toLowerCase().includes("domain")
        );

        setServerInfo({
          version: "1.0.0",
          environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
          database: dbService
            ? dbService.status === "healthy"
              ? "Connected"
              : "Error"
            : "Unknown",
          queue: allHealthy ? "Healthy" : "Degraded",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSuccess("Settings saved successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings className="h-6 w-6" />
            System Settings
          </h1>
          <p className="text-muted-foreground">
            Configure system-wide settings for the email platform
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-green-700 dark:bg-green-950 dark:text-green-400">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* SMTP Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                SMTP Settings
              </CardTitle>
              <CardDescription>Configure email sending limits and requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxMessageSize">Max Message Size (MB)</Label>
                <Input
                  id="maxMessageSize"
                  type="number"
                  value={settings.smtp.maxMessageSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      smtp: { ...settings.smtp, maxMessageSize: parseInt(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRecipients">Max Recipients per Email</Label>
                <Input
                  id="maxRecipients"
                  type="number"
                  value={settings.smtp.maxRecipients}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      smtp: { ...settings.smtp, maxRecipients: parseInt(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (emails/hour)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  value={settings.smtp.rateLimit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      smtp: { ...settings.smtp, rateLimit: parseInt(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="requireTls">Require TLS</Label>
                <Switch
                  id="requireTls"
                  checked={settings.smtp.requireTls}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      smtp: { ...settings.smtp, requireTls: checked },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure email authentication and security policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enforceSpf">Enforce SPF</Label>
                <Switch
                  id="enforceSpf"
                  checked={settings.security.enforceSpf}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, enforceSpf: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enforceDkim">Enforce DKIM</Label>
                <Switch
                  id="enforceDkim"
                  checked={settings.security.enforceDkim}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, enforceDkim: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enforceDmarc">Enforce DMARC</Label>
                <Switch
                  id="enforceDmarc"
                  checked={settings.security.enforceDmarc}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, enforceDmarc: checked },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quarantineThreshold">Spam Quarantine Threshold (%)</Label>
                <Input
                  id="quarantineThreshold"
                  type="number"
                  min={0}
                  max={100}
                  value={settings.security.quarantineThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      security: {
                        ...settings.security,
                        quarantineThreshold: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Retention Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Retention
              </CardTitle>
              <CardDescription>Configure data retention and backup policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailRetention">Email Retention (days)</Label>
                <Input
                  id="emailRetention"
                  type="number"
                  value={settings.retention.emailRetentionDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention: {
                        ...settings.retention,
                        emailRetentionDays: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logsRetention">Logs Retention (days)</Label>
                <Input
                  id="logsRetention"
                  type="number"
                  value={settings.retention.logsRetentionDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention: {
                        ...settings.retention,
                        logsRetentionDays: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="backupEnabled">Automatic Backups</Label>
                <Switch
                  id="backupEnabled"
                  checked={settings.retention.backupEnabled}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      retention: { ...settings.retention, backupEnabled: checked },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>Configure admin notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="adminAlerts">Admin Alerts</Label>
                <Switch
                  id="adminAlerts"
                  checked={settings.notifications.adminAlerts}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, adminAlerts: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="bounceNotifications">Bounce Notifications</Label>
                <Switch
                  id="bounceNotifications"
                  checked={settings.notifications.bounceNotifications}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, bounceNotifications: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="quotaWarnings">Quota Warnings</Label>
                <Switch
                  id="quotaWarnings"
                  checked={settings.notifications.quotaWarnings}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, quotaWarnings: checked },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Server Info */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Server Information
              </CardTitle>
              <CardDescription>Current server status and configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Version</div>
                  <div className="text-lg font-semibold">{serverInfo.version}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Environment</div>
                  <div className="text-lg font-semibold">{serverInfo.environment}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Database</div>
                  <div
                    className={`text-lg font-semibold ${serverInfo.database === "Connected" ? "text-green-600" : "text-yellow-600"}`}
                  >
                    {serverInfo.database}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Queue Status</div>
                  <div
                    className={`text-lg font-semibold ${serverInfo.queue === "Healthy" ? "text-green-600" : "text-yellow-600"}`}
                  >
                    {serverInfo.queue}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
