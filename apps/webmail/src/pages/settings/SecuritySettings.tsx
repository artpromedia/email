import { useState } from "react";
import {
  Shield,
  Key,
  Smartphone,
  Fingerprint,
  Monitor,
  Link,
  Unlink,
  LogOut,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function SecuritySettings() {
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const [passkeys] = useState([
    {
      id: "1",
      name: "MacBook Pro Touch ID",
      created: "2024-01-15",
      lastUsed: "2024-08-28",
    },
    {
      id: "2",
      name: "iPhone Face ID",
      created: "2024-02-20",
      lastUsed: "2024-08-27",
    },
  ]);

  const [connectedProviders] = useState([
    { id: "google", name: "Google", email: "user@gmail.com", connected: true },
    {
      id: "microsoft",
      name: "Microsoft",
      email: "user@outlook.com",
      connected: false,
    },
    { id: "github", name: "GitHub", username: "username", connected: true },
  ]);

  const [activeSessions] = useState([
    {
      id: "1",
      device: "MacBook Pro",
      location: "New York, US",
      browser: "Chrome 127",
      lastActive: "Active now",
      current: true,
    },
    {
      id: "2",
      device: "iPhone 15 Pro",
      location: "New York, US",
      browser: "Safari 17",
      lastActive: "2 hours ago",
      current: false,
    },
    {
      id: "3",
      device: "Windows PC",
      location: "London, UK",
      browser: "Edge 126",
      lastActive: "1 day ago",
      current: false,
    },
  ]);

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password mismatch",
        description: "New password and confirm password do not match.",
      });
      return;
    }

    // TODO: Implement password change API call
    toast({
      title: "Password changed",
      description: "Your password has been updated successfully.",
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleToggleMFA = (enabled: boolean) => {
    setMfaEnabled(enabled);
    toast({
      title: enabled ? "MFA enabled" : "MFA disabled",
      description: enabled
        ? "Two-factor authentication has been enabled for your account."
        : "Two-factor authentication has been disabled for your account.",
    });
  };

  const handleEnrollPasskey = () => {
    // TODO: Implement WebAuthn enrollment
    toast({
      title: "Passkey enrollment",
      description:
        "WebAuthn passkey enrollment will be implemented with backend support.",
    });
  };

  const handleRemovePasskey = (id: string) => {
    // TODO: Implement passkey removal
    toast({
      title: "Passkey removed",
      description: "The passkey has been removed from your account.",
    });
  };

  const handleConnectProvider = (providerId: string) => {
    // TODO: Implement OIDC provider connection
    toast({
      title: "Provider connection",
      description:
        "OIDC provider connection will be implemented with backend support.",
    });
  };

  const handleDisconnectProvider = (providerId: string) => {
    // TODO: Implement OIDC provider disconnection
    toast({
      title: "Provider disconnected",
      description:
        "The login provider has been disconnected from your account.",
    });
  };

  const handleRevokeSession = (sessionId: string) => {
    // TODO: Implement session revocation
    toast({
      title: "Session revoked",
      description: "The session has been revoked successfully.",
    });
  };

  const handleRevokeAllSessions = () => {
    // TODO: Implement revoke all sessions
    toast({
      title: "All sessions revoked",
      description:
        "All other sessions have been revoked. You will remain signed in on this device.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Security Settings</h2>
        <p className="text-muted-foreground">
          Manage your account security, authentication methods, and active
          sessions.
        </p>
      </div>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Multi-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* TOTP */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <span className="font-medium">Authenticator App</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Use an authenticator app to generate time-based codes
              </p>
            </div>
            <Switch checked={mfaEnabled} onCheckedChange={handleToggleMFA} />
          </div>

          <Separator />

          {/* SMS */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <span className="font-medium">SMS Backup</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Receive backup codes via SMS
              </p>
            </div>
            <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Passkeys (WebAuthn)
          </CardTitle>
          <CardDescription>
            Use biometric authentication or security keys for passwordless
            login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium">{passkey.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Created {passkey.created} • Last used {passkey.lastUsed}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePasskey(passkey.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button onClick={handleEnrollPasskey}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Passkey
          </Button>
        </CardContent>
      </Card>

      {/* Connected Logins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Connected Logins
          </CardTitle>
          <CardDescription>
            Manage third-party login providers connected to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {connectedProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {provider.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{provider.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {"email" in provider ? provider.email : provider.username}
                    </div>
                  </div>
                  <Badge variant={provider.connected ? "default" : "secondary"}>
                    {provider.connected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                <Button
                  variant={provider.connected ? "destructive" : "default"}
                  size="sm"
                  onClick={() =>
                    provider.connected
                      ? handleDisconnectProvider(provider.id)
                      : handleConnectProvider(provider.id)
                  }
                >
                  {provider.connected ? (
                    <>
                      <Unlink className="mr-2 h-4 w-4" />
                      Disconnect
                    </>
                  ) : (
                    <>
                      <Link className="mr-2 h-4 w-4" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>
            Monitor and manage your active login sessions across all devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{session.device}</span>
                      {session.current && (
                        <Badge variant="default">Current</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session.browser} • {session.location} •{" "}
                      {session.lastActive}
                    </div>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Separator />

          <Button variant="destructive" onClick={handleRevokeAllSessions}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out All Other Sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
