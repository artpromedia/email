"use client";

/**
 * Organization Domains Settings Page
 * Manage custom domains for the organization
 */

import { useState, useEffect } from "react";
import {
  Globe,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  RefreshCw,
  Trash2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@email/ui";

interface Domain {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  isPrimary: boolean;
  dnsRecords: DNSRecord[];
  createdAt: string;
  verifiedAt?: string;
}

interface DNSRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

export default function DomainsSettingsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const response = await fetch("/api/v1/organization/domains");
        const data = (await response.json()) as { domains: Domain[] };
        setDomains(data.domains);
      } catch (err) {
        console.error("Failed to fetch domains:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchDomains();
  }, []);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);

  const handleAddDomain = () => {
    if (!newDomain) return;

    // TODO: API call to add domain
    const domain: Domain = {
      id: Date.now().toString(),
      domain: newDomain,
      status: "pending",
      isPrimary: false,
      dnsRecords: [
        { type: "MX", name: "@", value: "mail.oonrumail.com", verified: false },
        { type: "TXT", name: "@", value: `v=spf1 include:oonrumail.com ~all`, verified: false },
        { type: "TXT", name: "oonru._domainkey", value: "v=DKIM1; k=rsa; p=...", verified: false },
        {
          type: "TXT",
          name: "_dmarc",
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${newDomain}`,
          verified: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    setDomains([...domains, domain]);
    setNewDomain("");
    setAddDialogOpen(false);
  };

  const handleVerifyDomain = async (domainId: string) => {
    setVerifying(domainId);
    try {
      // TODO: API call to verify domain
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setDomains(
        domains.map((d) =>
          d.id === domainId
            ? {
                ...d,
                status: "verified",
                verifiedAt: new Date().toISOString(),
                dnsRecords: d.dnsRecords.map((r) => ({ ...r, verified: true })),
              }
            : d
        )
      );
    } catch (error) {
      console.error("Failed to verify:", error);
    } finally {
      setVerifying(null);
    }
  };

  const handleDeleteDomain = (domainId: string) => {
    if (confirm("Are you sure you want to remove this domain?")) {
      // TODO: API call to delete domain
      setDomains(domains.filter((d) => d.id !== domainId));
    }
  };

  const handleSetPrimary = (domainId: string) => {
    // TODO: API call to set primary domain
    setDomains(
      domains.map((d) => ({
        ...d,
        isPrimary: d.id === domainId,
      }))
    );
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    alert("Copied to clipboard");
  };

  const getStatusIcon = (status: Domain["status"]) => {
    switch (status) {
      case "verified":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: Domain["status"]) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-100 text-green-800">Verified</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe className="h-6 w-6" />
            Domain Management
          </h1>
          <p className="text-muted-foreground">
            Add and manage custom domains for your organization
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Custom Domain</DialogTitle>
              <DialogDescription>
                Enter the domain you want to use with your organization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain">Domain Name</Label>
                <Input
                  id="domain"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDomain}>Add Domain</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Domains List */}
      <div className="space-y-4">
        {domains.map((domain) => (
          <Card key={domain.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(domain.status)}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {domain.domain}
                      {domain.isPrimary && <Badge variant="secondary">Primary</Badge>}
                    </CardTitle>
                    <CardDescription>
                      Added on {new Date(domain.createdAt).toLocaleDateString()}
                      {domain.verifiedAt &&
                        ` • Verified on ${new Date(domain.verifiedAt).toLocaleDateString()}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(domain.status)}
                  {domain.status === "pending" && (
                    <Button
                      size="sm"
                      onClick={() => handleVerifyDomain(domain.id)}
                      disabled={verifying === domain.id}
                    >
                      {verifying === domain.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  )}
                  {domain.status === "verified" && !domain.isPrimary && (
                    <Button size="sm" variant="outline" onClick={() => handleSetPrimary(domain.id)}>
                      Set Primary
                    </Button>
                  )}
                  {!domain.isPrimary && (
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteDomain(domain.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm font-medium">DNS Records</div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left">Type</th>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Value</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domain.dnsRecords.map((record, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2 font-mono">{record.type}</td>
                          <td className="px-4 py-2 font-mono">{record.name}</td>
                          <td className="max-w-[300px] truncate px-4 py-2 font-mono text-xs">
                            {record.value}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {record.verified ? (
                              <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" />
                            ) : (
                              <Clock className="mx-auto h-4 w-4 text-yellow-500" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(record.value)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {domain.status === "pending" && (
                  <div className="flex items-start gap-2 rounded-lg bg-yellow-50 p-4 text-yellow-800">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div className="text-sm">
                      <div className="font-medium">DNS records not verified</div>
                      <div>
                        Add the above DNS records to your domain&apos;s DNS settings and click
                        Verify to complete the setup.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
