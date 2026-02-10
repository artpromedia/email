"use client";

/**
 * Domain Management Page
 * List, create, and manage email domains
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Plus,
  Search,
  MoreHorizontal,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Trash2,
  Settings,
  Key,
  Shield,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
} from "@email/ui";

interface Domain {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended" | "unverified";
  verified: boolean;
  dkimEnabled: boolean;
  spfEnabled: boolean;
  dmarcEnabled: boolean;
  userCount: number;
  emailCount: number;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8084";

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  const fetchDomains = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/admin/domains`);
      if (!res.ok) throw new Error("Failed to fetch domains");
      const data = (await res.json()) as { domains?: Domain[] };
      setDomains(data.domains ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return;

    try {
      setAddingDomain(true);
      const res = await fetch(`${API_BASE}/api/admin/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDomainName.trim().toLowerCase() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "Failed to add domain");
      }

      setNewDomainName("");
      setShowAddDialog(false);
      void fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!confirm("Are you sure you want to delete this domain?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete domain");
      void fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete domain");
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/domains/${domainId}/verify`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Verification failed");
      void fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const filteredDomains = domains.filter((domain) =>
    domain.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "suspended":
      case "unverified":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your email domains and DNS configuration
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Domain</DialogTitle>
              <DialogDescription>
                Enter the domain name you want to add. You&apos;ll need to verify ownership via DNS
                records.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="domain-name">Domain Name</Label>
              <Input
                id="domain-name"
                placeholder="example.com"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDomain} disabled={addingDomain || !newDomainName.trim()}>
                {addingDomain ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Domain"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search domains..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Domains List */}
      <Card>
        <CardHeader>
          <CardTitle>All Domains ({filteredDomains.length})</CardTitle>
          <CardDescription>
            Click on a domain to manage its settings, DNS records, and DKIM keys
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {searchQuery ? "No domains match your search" : "No domains configured yet"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDomains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <div className="flex items-center gap-4">
                    <Globe className="h-8 w-8 text-gray-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/domains/${domain.id}`}
                          className="font-medium hover:text-blue-600"
                        >
                          {domain.name}
                        </Link>
                        <Badge
                          variant={
                            domain.status === "active"
                              ? "default"
                              : domain.status === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {getStatusIcon(domain.status)}
                          <span className="ml-1">{domain.status}</span>
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                        <span>{domain.userCount || 0} users</span>
                        <span>{domain.emailCount.toLocaleString()} emails</span>
                        <span>Created {new Date(domain.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {domain.dkimEnabled && (
                          <Badge variant="outline" className="text-xs">
                            <Key className="mr-1 h-3 w-3" /> DKIM
                          </Badge>
                        )}
                        {domain.spfEnabled && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="mr-1 h-3 w-3" /> SPF
                          </Badge>
                        )}
                        {domain.dmarcEnabled && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="mr-1 h-3 w-3" /> DMARC
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerifyDomain(domain.id)}
                      >
                        Verify DNS
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/domains/${domain.id}`}>
                            <Settings className="mr-2 h-4 w-4" />
                            Manage
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/domains/${domain.id}/dkim`}>
                            <Key className="mr-2 h-4 w-4" />
                            DKIM Keys
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeleteDomain(domain.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
