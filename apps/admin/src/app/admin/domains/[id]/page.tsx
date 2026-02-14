"use client";

/**
 * Domain Detail Page
 * Manage individual domain settings, DNS, DKIM, etc.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  Key,
  Copy,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Switch,
} from "@email/ui";

interface DomainDetail {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended" | "unverified";
  verified: boolean;
  dkimEnabled: boolean;
  spfEnabled: boolean;
  dmarcEnabled: boolean;
  catchAllEnabled: boolean;
  catchAllAddress: string;
  userCount: number;
  emailCount: number;
  createdAt: string;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

interface DkimKey {
  id: string;
  selector: string;
  publicKey: string;
  active: boolean;
  createdAt: string;
}

const API_BASE = "/api/v1";

export default function DomainDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainId = params["id"] as string;
  const defaultTab = searchParams.get("tab") ?? "dns";

  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [_dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [dkimKeys, setDkimKeys] = useState<DkimKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchDomain = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/domains/${domainId}`);
      if (!res.ok) throw new Error("Failed to fetch domain");
      const data = (await res.json()) as DomainDetail;
      setDomain(data);

      // Fetch DNS records
      const dnsRes = await fetch(`${API_BASE}/domains/${domainId}/dns`, {
        method: "POST",
      });
      if (dnsRes.ok) {
        const dnsData = (await dnsRes.json()) as { records?: DnsRecord[] };
        setDnsRecords(dnsData.records ?? []);
      }

      // Fetch DKIM keys
      const dkimRes = await fetch(`${API_BASE}/domains/${domainId}/dkim`);
      if (dkimRes.ok) {
        const dkimData = (await dkimRes.json()) as { keys?: DkimKey[] };
        setDkimKeys(dkimData.keys ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch domain");
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => {
    if (domainId) void fetchDomain();
  }, [domainId, fetchDomain]);

  const handleSave = async () => {
    if (!domain) return;

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/domains/${domainId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catchAllEnabled: domain.catchAllEnabled,
          catchAllAddress: domain.catchAllAddress,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      void fetchDomain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    try {
      const res = await fetch(`${API_BASE}/domains/${domainId}/verify`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Verification failed");
      void fetchDomain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const handleGenerateDkim = async () => {
    try {
      const res = await fetch(`${API_BASE}/domains/${domainId}/dkim`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate DKIM key");
      void fetchDomain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate DKIM key");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this domain? This cannot be undone.")) return;

    try {
      const res = await fetch(`${API_BASE}/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete domain");
      router.push("/admin/domains");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete domain");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="p-6">
        <div className="py-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Domain not found</h2>
          <Link href="/admin/domains">
            <Button variant="link">Back to Domains</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/domains"
          className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Domains
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Globe className="h-10 w-10 text-gray-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{domain.name}</h1>
              <div className="mt-1 flex items-center gap-2">
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
                <span className="text-sm text-gray-500">
                  Created {new Date(domain.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleVerify}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Verify DNS
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="dns">DNS Records</TabsTrigger>
          <TabsTrigger value="dkim">DKIM</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dns">
          <Card>
            <CardHeader>
              <CardTitle>Required DNS Records</CardTitle>
              <CardDescription>
                Add these DNS records to verify your domain and enable email functionality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* MX Record */}
                <div className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>MX</Badge>
                      <span className="font-medium">Mail Exchange</span>
                    </div>
                    {domain.verified ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-800">
                    <span>10 mail.oonrumail.com.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard("10 mail.oonrumail.com.", "mx")}
                    >
                      {copied === "mx" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* SPF Record */}
                <div className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>TXT</Badge>
                      <span className="font-medium">SPF</span>
                    </div>
                    {domain.spfEnabled ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-800">
                    <span className="break-all">v=spf1 include:_spf.oonrumail.com ~all</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard("v=spf1 include:_spf.oonrumail.com ~all", "spf")
                      }
                    >
                      {copied === "spf" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* DMARC Record */}
                <div className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>TXT</Badge>
                      <span className="font-medium">DMARC</span>
                    </div>
                    {domain.dmarcEnabled ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-800">
                    <span className="break-all">
                      v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain.name}`,
                          "dmarc"
                        )
                      }
                    >
                      {copied === "dmarc" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dkim">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>DKIM Keys</CardTitle>
                  <CardDescription>
                    DomainKeys Identified Mail for email authentication
                  </CardDescription>
                </div>
                <Button onClick={handleGenerateDkim}>
                  <Key className="mr-2 h-4 w-4" />
                  Generate New Key
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dkimKeys.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  No DKIM keys configured. Generate one to enable email signing.
                </div>
              ) : (
                <div className="space-y-4">
                  {dkimKeys.map((key) => (
                    <div key={key.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">Selector: {key.selector}</span>
                          {key.active && <Badge>Active</Badge>}
                        </div>
                        <span className="text-sm text-gray-500">
                          Created {new Date(key.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-2">
                        <Label className="text-sm text-gray-500">DNS Record Name</Label>
                        <div className="mt-1 rounded bg-gray-100 p-2 font-mono text-sm dark:bg-gray-800">
                          {key.selector}._domainkey.{domain.name}
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-sm text-gray-500">DNS Record Value (TXT)</Label>
                        <div className="mt-1 break-all rounded bg-gray-100 p-2 font-mono text-xs dark:bg-gray-800">
                          v=DKIM1; k=rsa; p={key.publicKey.substring(0, 100)}...
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Domain Settings</CardTitle>
              <CardDescription>Configure domain-specific email settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Catch-All Email</Label>
                  <p className="text-sm text-gray-500">
                    Receive emails sent to non-existent addresses
                  </p>
                </div>
                <Switch
                  checked={domain.catchAllEnabled}
                  onCheckedChange={(checked: boolean) =>
                    setDomain({ ...domain, catchAllEnabled: checked })
                  }
                />
              </div>

              {domain.catchAllEnabled && (
                <div>
                  <Label htmlFor="catch-all">Catch-All Address</Label>
                  <Input
                    id="catch-all"
                    value={domain.catchAllAddress}
                    onChange={(e) => setDomain({ ...domain, catchAllAddress: e.target.value })}
                    placeholder={`admin@${domain.name}`}
                    className="mt-2"
                  />
                </div>
              )}

              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
