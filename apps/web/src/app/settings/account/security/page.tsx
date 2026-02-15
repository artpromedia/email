"use client";

/**
 * Account Security Settings Page
 * Manage password, 2FA, and session security
 */

import { useState, useEffect } from "react";
import {
  Shield,
  Key,
  Smartphone,
  MonitorSmartphone,
  Eye,
  EyeOff,
  Trash2,
  Clock,
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
  Switch,
  Badge,
} from "@email/ui";
import { getAuthApiUrl } from "@/lib/api-url";

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export default function SecuritySettingsPage() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [, setLoading] = useState(true);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch("/api/auth/sessions");
        const data = (await response.json()) as { sessions?: Session[] };
        if (data.sessions) {
          setSessions(data.sessions);
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchSessions();
  }, []);

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    try {
      const API_URL = getAuthApiUrl();
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/auth/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || response.statusText);
      }
      alert("Password changed successfully");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      console.error("Failed to change password:", error);
      alert(error instanceof Error ? error.message : "Failed to change password");
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const API_URL = getAuthApiUrl();
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to revoke session: ${response.statusText}`);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      alert(`Session ${sessionId} revoked`);
    } catch (error) {
      console.error("Failed to revoke session:", error);
      alert(error instanceof Error ? error.message : "Failed to revoke session");
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      const API_URL = getAuthApiUrl();
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/auth/sessions`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to revoke sessions: ${response.statusText}`);
      }
      setSessions((prev) => prev.filter((s) => s.current));
      alert("All other sessions revoked");
    } catch (error) {
      console.error("Failed to revoke all sessions:", error);
      alert(error instanceof Error ? error.message : "Failed to revoke sessions");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Shield className="h-6 w-6" />
          Security Settings
        </h1>
        <p className="text-muted-foreground">Manage your account security and sessions</p>
      </div>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password regularly to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
            />
          </div>
          <Button onClick={handleChangePassword}>Update Password</Button>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Enable 2FA</div>
              <div className="text-sm text-muted-foreground">
                Require a verification code when signing in
              </div>
            </div>
            <Switch
              checked={twoFactorEnabled}
              onCheckedChange={async (checked: boolean) => {
                try {
                  const API_URL = getAuthApiUrl();
                  const token = localStorage.getItem("accessToken");
                  const response = await fetch(`${API_URL}/api/auth/2fa/toggle`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ enabled: checked }),
                  });
                  if (!response.ok) {
                    throw new Error(`Failed to toggle 2FA: ${response.statusText}`);
                  }
                  setTwoFactorEnabled(checked);
                } catch (error) {
                  console.error("Failed to toggle 2FA:", error);
                  alert(error instanceof Error ? error.message : "Failed to toggle 2FA");
                }
              }}
            />
          </div>
          {twoFactorEnabled && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="text-sm">
                Two-factor authentication is enabled. You can manage your authentication methods
                below.
              </div>
              <div className="mt-4 space-y-2">
                <Button variant="outline" size="sm">
                  Configure Authenticator App
                </Button>
                <Button variant="outline" size="sm" className="ml-2">
                  View Recovery Codes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>Manage your active sessions across devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-muted p-2">
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{session.device}</span>
                      {session.current && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session.browser} • {session.location}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {session.lastActive}
                    </div>
                  </div>
                </div>
                {!session.current && (
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeSession(session.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={handleRevokeAllSessions}>
            Revoke All Other Sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
