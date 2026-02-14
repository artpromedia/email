"use client";

/**
 * SSO Settings Page
 * Configure Single Sign-On for the organization
 */

import { useState, useEffect, type ChangeEvent } from "react";
import {
  Shield,
  Key,
  Plus,
  Settings,
  Trash2,
  ExternalLink,
  Copy,
  AlertTriangle,
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
  Badge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@email/ui";

interface SSOProvider {
  id: string;
  name: string;
  type: "saml" | "oidc";
  enabled: boolean;
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
  clientId?: string;
  issuer?: string;
  domains: string[];
  createdAt: string;
}

export default function SSOSettingsPage() {
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [enforceSSO, setEnforceSSO] = useState(false);
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSSOProviders = async () => {
      try {
        const response = await fetch("/api/v1/organization/sso");
        const data = (await response.json()) as {
          providers: SSOProvider[];
          ssoEnabled: boolean;
          enforceSSO: boolean;
        };
        setProviders(data.providers);
        setSsoEnabled(data.ssoEnabled);
        setEnforceSSO(data.enforceSSO);
      } catch (err) {
        console.error("Failed to fetch SSO providers:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchSSOProviders();
  }, []);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: "",
    type: "saml" as "saml" | "oidc",
    entityId: "",
    ssoUrl: "",
    certificate: "",
    clientId: "",
    clientSecret: "",
    issuer: "",
  });

  // Service Provider (SP) metadata
  const spMetadata = {
    entityId: "https://mail.oonrumail.com/auth/saml",
    acsUrl: "https://mail.oonrumail.com/auth/saml/callback",
    logoutUrl: "https://mail.oonrumail.com/auth/saml/logout",
    metadataUrl: "https://mail.oonrumail.com/auth/saml/metadata",
  };

  const oidcMetadata = {
    redirectUri: "https://mail.oonrumail.com/auth/oidc/callback",
    logoutUri: "https://mail.oonrumail.com/auth/oidc/logout",
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    alert("Copied to clipboard");
  };

  const handleAddProvider = async () => {
    try {
      const API_URL = process.env["NEXT_PUBLIC_AUTH_API_URL"] || "http://localhost:8081";
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/v1/auth/sso/providers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(newProvider),
      });
      if (!response.ok) {
        throw new Error(`Failed to add provider: ${response.statusText}`);
      }
      const data = (await response.json()) as { provider?: SSOProvider };
      const provider: SSOProvider = data.provider ?? {
        id: Date.now().toString(),
        name: newProvider.name,
        type: newProvider.type,
        enabled: true,
        entityId: newProvider.entityId || undefined,
        ssoUrl: newProvider.ssoUrl || undefined,
        certificate: newProvider.certificate || undefined,
        clientId: newProvider.clientId || undefined,
        issuer: newProvider.issuer || undefined,
        domains: [],
        createdAt: new Date().toISOString(),
      };
      setProviders([...providers, provider]);
      setAddDialogOpen(false);
      setNewProvider({
        name: "",
        type: "saml",
        entityId: "",
        ssoUrl: "",
        certificate: "",
        clientId: "",
        clientSecret: "",
        issuer: "",
      });
    } catch (error) {
      console.error("Failed to add provider:", error);
      alert(error instanceof Error ? error.message : "Failed to add provider");
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm("Are you sure you want to delete this SSO provider?")) return;
    try {
      const API_URL = process.env["NEXT_PUBLIC_AUTH_API_URL"] || "http://localhost:8081";
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/v1/auth/sso/providers/${providerId}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to delete provider: ${response.statusText}`);
      }
      setProviders(providers.filter((p) => p.id !== providerId));
    } catch (error) {
      console.error("Failed to delete provider:", error);
      alert(error instanceof Error ? error.message : "Failed to delete provider");
    }
  };

  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    try {
      const API_URL = process.env["NEXT_PUBLIC_AUTH_API_URL"] || "http://localhost:8081";
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/v1/auth/sso/providers/${providerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        throw new Error(`Failed to toggle provider: ${response.statusText}`);
      }
      setProviders(providers.map((p) => (p.id === providerId ? { ...p, enabled } : p)));
    } catch (error) {
      console.error("Failed to toggle provider:", error);
      alert(error instanceof Error ? error.message : "Failed to toggle provider");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Shield className="h-6 w-6" />
          Single Sign-On (SSO)
        </h1>
        <p className="text-muted-foreground">
          Configure SSO to allow users to sign in with your identity provider
        </p>
      </div>

      {/* SSO Status */}
      <Card>
        <CardHeader>
          <CardTitle>SSO Status</CardTitle>
          <CardDescription>Enable SSO for your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable SSO</Label>
              <p className="text-sm text-muted-foreground">
                Allow users to sign in with your identity provider
              </p>
            </div>
            <Switch checked={ssoEnabled} onCheckedChange={setSsoEnabled} />
          </div>
          {ssoEnabled && (
            <div className="flex items-center justify-between">
              <div>
                <Label>Enforce SSO</Label>
                <p className="text-sm text-muted-foreground">
                  Require SSO for all users (disable password login)
                </p>
              </div>
              <Switch checked={enforceSSO} onCheckedChange={setEnforceSSO} />
            </div>
          )}
          {enforceSSO && (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-50 p-4 text-yellow-800">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium">SSO Enforcement Active</div>
                <div>
                  All users will be required to sign in using SSO. Make sure your identity provider
                  is properly configured before enabling this option.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {ssoEnabled && (
        <>
          {/* Service Provider Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Service Provider (SP) Metadata</CardTitle>
              <CardDescription>
                Use these values to configure your identity provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="saml">
                <TabsList>
                  <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
                  <TabsTrigger value="oidc">OpenID Connect</TabsTrigger>
                </TabsList>
                <TabsContent value="saml" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Entity ID (Audience URI)</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {spMetadata.entityId}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(spMetadata.entityId)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">ACS URL (Reply URL)</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {spMetadata.acsUrl}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(spMetadata.acsUrl)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Single Logout URL</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {spMetadata.logoutUrl}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(spMetadata.logoutUrl)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Metadata URL</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {spMetadata.metadataUrl}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(spMetadata.metadataUrl)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(spMetadata.metadataUrl, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="oidc" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Redirect URI</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {oidcMetadata.redirectUri}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(oidcMetadata.redirectUri)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Post Logout Redirect URI</div>
                        <div className="font-mono text-sm text-muted-foreground">
                          {oidcMetadata.logoutUri}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(oidcMetadata.logoutUri)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* SSO Providers */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Identity Providers</CardTitle>
                  <CardDescription>Configure your SSO identity providers</CardDescription>
                </div>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Provider
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add Identity Provider</DialogTitle>
                      <DialogDescription>Configure a new SSO identity provider</DialogDescription>
                    </DialogHeader>
                    <Tabs
                      value={newProvider.type}
                      onValueChange={(v) =>
                        setNewProvider({ ...newProvider, type: v as "saml" | "oidc" })
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
                        <TabsTrigger value="oidc">OpenID Connect</TabsTrigger>
                      </TabsList>
                      <TabsContent value="saml" className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Provider Name</Label>
                          <Input
                            id="name"
                            placeholder="e.g., Okta, Azure AD"
                            value={newProvider.name}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="entityId">IdP Entity ID</Label>
                          <Input
                            id="entityId"
                            placeholder="https://idp.example.com/saml/metadata"
                            value={newProvider.entityId}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, entityId: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ssoUrl">SSO URL</Label>
                          <Input
                            id="ssoUrl"
                            placeholder="https://idp.example.com/saml/sso"
                            value={newProvider.ssoUrl}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, ssoUrl: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="certificate">X.509 Certificate</Label>
                          <Textarea
                            id="certificate"
                            placeholder="-----BEGIN CERTIFICATE-----"
                            value={newProvider.certificate}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                              setNewProvider({ ...newProvider, certificate: e.target.value })
                            }
                            rows={4}
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="oidc" className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name-oidc">Provider Name</Label>
                          <Input
                            id="name-oidc"
                            placeholder="e.g., Google, Microsoft"
                            value={newProvider.name}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issuer">Issuer URL</Label>
                          <Input
                            id="issuer"
                            placeholder="https://accounts.google.com"
                            value={newProvider.issuer}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, issuer: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="clientId">Client ID</Label>
                          <Input
                            id="clientId"
                            placeholder="your-client-id"
                            value={newProvider.clientId}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, clientId: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="clientSecret">Client Secret</Label>
                          <Input
                            id="clientSecret"
                            type="password"
                            placeholder="your-client-secret"
                            value={newProvider.clientSecret}
                            onChange={(e) =>
                              setNewProvider({ ...newProvider, clientSecret: e.target.value })
                            }
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddProvider}>Add Provider</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {providers.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No identity providers configured. Click &quot;Add Provider&quot; to get started.
                  </div>
                ) : (
                  providers.map((provider) => (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-full bg-muted p-2">
                          <Key className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{provider.name}</span>
                            <Badge variant="outline">{provider.type.toUpperCase()}</Badge>
                            {provider.enabled ? (
                              <Badge className="bg-green-100 text-green-800">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {provider.domains.length > 0
                              ? `Domains: ${provider.domains.join(", ")}`
                              : "No domains assigned"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={provider.enabled}
                          onCheckedChange={(checked: boolean) =>
                            handleToggleProvider(provider.id, checked)
                          }
                        />
                        <Button size="sm" variant="ghost">
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteProvider(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
