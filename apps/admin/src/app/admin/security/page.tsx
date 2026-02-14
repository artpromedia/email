"use client";

/**
 * Security Page
 * Security settings, audit logs, and threat monitoring
 */

import { useCallback, useEffect, useState } from "react";
import { Shield, Key, Lock, Activity, RefreshCw, Copy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Switch,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Input,
} from "@email/ui";

interface SecuritySettings {
  mfaRequired: boolean;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  ipWhitelistEnabled: boolean;
  ipWhitelist: string[];
}

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  status: "success" | "failure";
  details?: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsed: string | null;
  expiresAt: string | null;
}

const API_BASE = "/api/v1";

export default function SecurityPage() {
  const [settings, setSettings] = useState<SecuritySettings>({
    mfaRequired: false,
    passwordMinLength: 12,
    passwordRequireUppercase: true,
    passwordRequireNumbers: true,
    passwordRequireSymbols: true,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
    ipWhitelistEnabled: false,
    ipWhitelist: [],
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch security settings
      const settingsRes = await fetch(`${API_BASE}/security/settings`);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as SecuritySettings;
        setSettings(data);
      }

      // Fetch audit logs
      const logsRes = await fetch(`${API_BASE}/security/audit?limit=50`);
      if (logsRes.ok) {
        const data = (await logsRes.json()) as { logs?: AuditLog[] };
        setAuditLogs(data.logs ?? []);
      } else {
        setAuditLogs([]);
      }

      // Fetch API keys
      const keysRes = await fetch(`${API_BASE}/security/api-keys`);
      if (keysRes.ok) {
        const data = (await keysRes.json()) as { keys?: ApiKey[] };
        setApiKeys(data.keys ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/security/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/security/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (!res.ok) throw new Error("Failed to create API key");
      const data = (await res.json()) as { key: string };
      setShowNewKey(data.key);
      setNewKeyName("");
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) return;

    try {
      const res = await fetch(`${API_BASE}/security/api-keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete API key");
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "login":
        return <Key className="h-4 w-4" />;
      case "logout":
        return <Lock className="h-4 w-4" />;
      case "password_change":
        return <Shield className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage security settings, audit logs, and API keys
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {showNewKey && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 dark:bg-green-950">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">
                API Key Created Successfully
              </p>
              <p className="mt-1 text-sm text-green-600 dark:text-green-500">
                Copy this key now. It won&apos;t be shown again.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(showNewKey);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <code className="mt-2 block rounded bg-green-100 p-2 font-mono text-sm dark:bg-green-900">
            {showNewKey}
          </code>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowNewKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="settings">Security Settings</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <div className="space-y-6">
            {/* Authentication Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication</CardTitle>
                <CardDescription>Configure authentication requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require MFA for all users</Label>
                    <p className="text-sm text-gray-500">
                      Force all users to enable two-factor authentication
                    </p>
                  </div>
                  <Switch
                    checked={settings.mfaRequired}
                    onCheckedChange={(checked: boolean) =>
                      setSettings({ ...settings, mfaRequired: checked })
                    }
                  />
                </div>

                <div>
                  <Label>Session Timeout (minutes)</Label>
                  <Input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) =>
                      setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) || 30 })
                    }
                    className="mt-2 max-w-xs"
                  />
                </div>

                <div>
                  <Label>Max Login Attempts</Label>
                  <Input
                    type="number"
                    value={settings.maxLoginAttempts}
                    onChange={(e) =>
                      setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) || 5 })
                    }
                    className="mt-2 max-w-xs"
                  />
                </div>

                <div>
                  <Label>Lockout Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={settings.lockoutDuration}
                    onChange={(e) =>
                      setSettings({ ...settings, lockoutDuration: parseInt(e.target.value) || 15 })
                    }
                    className="mt-2 max-w-xs"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Password Policy */}
            <Card>
              <CardHeader>
                <CardTitle>Password Policy</CardTitle>
                <CardDescription>Set password requirements for all users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Minimum Password Length</Label>
                  <Input
                    type="number"
                    value={settings.passwordMinLength}
                    onChange={(e) =>
                      setSettings({ ...settings, passwordMinLength: parseInt(e.target.value) || 8 })
                    }
                    className="mt-2 max-w-xs"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Require uppercase letters</Label>
                  <Switch
                    checked={settings.passwordRequireUppercase}
                    onCheckedChange={(checked: boolean) =>
                      setSettings({ ...settings, passwordRequireUppercase: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Require numbers</Label>
                  <Switch
                    checked={settings.passwordRequireNumbers}
                    onCheckedChange={(checked: boolean) =>
                      setSettings({ ...settings, passwordRequireNumbers: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Require symbols</Label>
                  <Switch
                    checked={settings.passwordRequireSymbols}
                    onCheckedChange={(checked: boolean) =>
                      setSettings({ ...settings, passwordRequireSymbols: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>Recent security events and user actions</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-gray-500">No audit logs found</div>
              ) : (
                <div className="space-y-4">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`rounded-full p-2 ${
                            log.status === "success"
                              ? "bg-green-100 text-green-600"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {getActionIcon(log.action)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {log.action.replace("_", " ")}
                            </span>
                            <Badge variant={log.status === "success" ? "default" : "destructive"}>
                              {log.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {log.userEmail} • {log.ipAddress}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage API access keys for integrations</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Key name"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-48"
                  />
                  <Button onClick={handleCreateApiKey} disabled={!newKeyName.trim()}>
                    Create Key
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <div className="py-8 text-center text-gray-500">No API keys created yet</div>
              ) : (
                <div className="space-y-4">
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{key.name}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {key.prefix}... • Created {new Date(key.createdAt).toLocaleDateString()}
                          {key.lastUsed &&
                            ` • Last used ${new Date(key.lastUsed).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteApiKey(key.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
