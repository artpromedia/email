import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  getDomains, 
  getDomainStats, 
  verifyDomain,
  updateDomainStatus,
  deleteDomain,
  type Domain, 
  type DomainFilters,
  type DomainStatus,
  type DomainType,
  type VerificationStatus
} from "../data/domains";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

import { 
  Search, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  MoreVertical,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Server,
  Users,
  Mail,
  HardDrive,
  TrendingUp,
  Settings,
  Verified,
  AlertCircle
} from "lucide-react";

const DomainManagement: React.FC = () => {
  const [filters, setFilters] = useState<DomainFilters>({});
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: domains = [], isLoading: isDomainsLoading, refetch: refetchDomains } = useQuery({
    queryKey: ["domains", filters],
    queryFn: () => getDomains(filters),
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ["domainStats"],
    queryFn: getDomainStats,
  });

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
  };

  const handleFilterChange = (key: keyof DomainFilters, value: string) => {
    setFilters(prev => ({ 
      ...prev, 
      [key]: value === "all" ? undefined : value 
    }));
  };

  const handleVerifyDomain = async (domain: Domain) => {
    try {
      await verifyDomain(domain.id);
      refetchDomains();
    } catch (error) {
      console.error("Failed to verify domain:", error);
    }
  };

  const handleUpdateStatus = async (domain: Domain, status: DomainStatus) => {
    try {
      await updateDomainStatus(domain.id, status);
      refetchDomains();
    } catch (error) {
      console.error("Failed to update domain status:", error);
    }
  };

  const handleDeleteDomain = async (domain: Domain) => {
    if (domain.isDefault) {
      alert("Cannot delete the default domain");
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete domain "${domain.name}"?`)) {
      try {
        await deleteDomain(domain.id);
        refetchDomains();
      } catch (error) {
        console.error("Failed to delete domain:", error);
      }
    }
  };

  const getDomainStatusBadge = (status: DomainStatus) => {
    const statusConfig = {
      active: { variant: "default" as const, icon: CheckCircle, color: "text-green-600" },
      pending: { variant: "outline" as const, icon: Clock, color: "text-yellow-600" },
      suspended: { variant: "destructive" as const, icon: XCircle, color: "text-red-600" },
      failed: { variant: "destructive" as const, icon: AlertTriangle, color: "text-red-600" },
      configuring: { variant: "secondary" as const, icon: Settings, color: "text-blue-600" }
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getVerificationBadge = (status: VerificationStatus) => {
    const verificationConfig = {
      verified: { variant: "default" as const, icon: Verified, color: "text-green-600" },
      pending: { variant: "outline" as const, icon: Clock, color: "text-yellow-600" },
      failed: { variant: "destructive" as const, icon: AlertCircle, color: "text-red-600" },
      not_started: { variant: "secondary" as const, icon: AlertTriangle, color: "text-gray-600" }
    };

    const config = verificationConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getDomainTypeIcon = (type: DomainType) => {
    switch (type) {
      case "primary":
        return <Globe className="h-4 w-4 text-blue-600" />;
      case "subdomain":
        return <Server className="h-4 w-4 text-green-600" />;
      case "alias":
        return <Mail className="h-4 w-4 text-purple-600" />;
      case "external":
        return <Shield className="h-4 w-4 text-orange-600" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  const DomainDetailsModal = ({ domain }: { domain: Domain }) => (
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {getDomainTypeIcon(domain.type)}
          {domain.name}
          {domain.isDefault && <Badge variant="outline">Default</Badge>}
        </DialogTitle>
        <DialogDescription>
          Domain configuration and statistics
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3">Domain Information</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Type:</span> {domain.type}</div>
              <div><span className="font-medium">Status:</span> {getDomainStatusBadge(domain.status)}</div>
              <div><span className="font-medium">Verification:</span> {getVerificationBadge(domain.verification.status)}</div>
              <div><span className="font-medium">Created:</span> {domain.createdAt.toLocaleDateString()}</div>
              <div><span className="font-medium">Updated:</span> {domain.updatedAt.toLocaleDateString()}</div>
              {domain.aliases.length > 0 && (
                <div><span className="font-medium">Aliases:</span> {domain.aliases.join(", ")}</div>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-3">Statistics</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Total Users:</span> {domain.statistics.totalUsers.toLocaleString()}</div>
              <div><span className="font-medium">Active Users:</span> {domain.statistics.activeUsers.toLocaleString()}</div>
              <div><span className="font-medium">Messages/Day:</span> {domain.statistics.messagesPerDay.toLocaleString()}</div>
              <div><span className="font-medium">Storage Used:</span> {domain.statistics.storageUsed} GB</div>
              <div><span className="font-medium">Bounce Rate:</span> {domain.statistics.bounceRate}%</div>
              <div><span className="font-medium">Spam Rate:</span> {domain.statistics.spamRate}%</div>
            </div>
          </div>
        </div>

        {/* DNS Records */}
        <div>
          <h4 className="font-semibold mb-3">DNS Records</h4>
          <div className="space-y-2">
            {domain.dnsRecords.map((record) => (
              <div key={record.id} className="p-3 bg-gray-50 rounded-lg border">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{record.type}</Badge>
                      <span className="font-medium">{record.name}</span>
                      {record.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">{record.description}</div>
                    <div className="font-mono text-xs bg-gray-100 p-2 rounded">{record.value}</div>
                    <div className="text-xs text-gray-500 mt-1">TTL: {record.ttl}s</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.status === "active" && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {record.status === "pending" && <Clock className="h-4 w-4 text-yellow-600" />}
                    {record.status === "error" && <AlertTriangle className="h-4 w-4 text-red-600" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mail Settings */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3">Mail Settings</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Max Message Size:</span> {domain.mailSettings.maxMessageSize} MB</div>
              <div><span className="font-medium">Retention Days:</span> {domain.mailSettings.retentionDays}</div>
              <div><span className="font-medium">Quota Per User:</span> {domain.mailSettings.quotaPerUser} GB</div>
              <div><span className="font-medium">External Forwarding:</span> {domain.mailSettings.allowExternalForwarding ? "Allowed" : "Blocked"}</div>
              <div><span className="font-medium">Require TLS:</span> {domain.mailSettings.requireTls ? "Yes" : "No"}</div>
              <div><span className="font-medium">Spam Filter:</span> {domain.mailSettings.enableSpamFilter ? "Enabled" : "Disabled"}</div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Security Settings</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">SPF Policy:</span> {domain.security.spfPolicy.replace(/_/g, ' ')}</div>
              <div><span className="font-medium">DKIM:</span> {domain.security.dkimEnabled ? "Enabled" : "Disabled"}</div>
              <div><span className="font-medium">DMARC Policy:</span> {domain.security.dmarcPolicy}</div>
              <div><span className="font-medium">MTA-STS:</span> {domain.security.mtaStsEnabled ? "Enabled" : "Disabled"}</div>
              <div><span className="font-medium">TLS Reporting:</span> {domain.security.tlsReportingEnabled ? "Enabled" : "Disabled"}</div>
              <div><span className="font-medium">Secure Auth:</span> {domain.security.requireSecureAuth ? "Required" : "Optional"}</div>
            </div>
          </div>
        </div>

        {/* Verification Errors */}
        {domain.verification.errors.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-red-600">Verification Errors</h4>
            <div className="space-y-1">
              {domain.verification.errors.map((error, index) => (
                <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {error}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );

  const CreateDomainModal = () => {
    const [formData, setFormData] = useState({
      name: "",
      type: "" as DomainType | "",
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!formData.name || !formData.type) {
        alert("Please fill in all required fields");
        return;
      }

      console.log("Creating new domain:", formData);
      alert(`Domain "${formData.name}" created successfully! (This is a demo - domain would be saved to database)`);
      
      setFormData({ name: "", type: "" as DomainType | "" });
      setShowCreateModal(false);
      refetchDomains();
    };

    return (
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Domain
          </DialogTitle>
          <DialogDescription>
            Add a new domain to your mail system
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Domain Name *</label>
            <Input
              placeholder="example.com"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Domain Type *</label>
            <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as DomainType }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary Domain</SelectItem>
                <SelectItem value="subdomain">Subdomain</SelectItem>
                <SelectItem value="alias">Domain Alias</SelectItem>
                <SelectItem value="external">External Domain</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Add Domain
            </Button>
          </div>
        </form>
      </DialogContent>
    );
  };

  if (isDomainsLoading || isStatsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Domain Management</h1>
          <p className="text-gray-600 mt-1">Manage email domains, DNS settings, and verification status</p>
        </div>
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <CreateDomainModal />
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDomains}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeDomains} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all domains
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Messages</CardTitle>
            <Mail className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.dailyMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Messages per day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats?.storageUsed} GB</div>
            <p className="text-xs text-muted-foreground">
              Total storage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search domains..."
                  className="pl-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>
            
            <Select onValueChange={(value) => handleFilterChange("status", value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="configuring">Configuring</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => handleFilterChange("type", value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="subdomain">Subdomain</SelectItem>
                <SelectItem value="alias">Alias</SelectItem>
                <SelectItem value="external">External</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => handleFilterChange("verification", value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Domains List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Domains ({domains.length})</CardTitle>
          <CardDescription>
            Manage email domains and their configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {domains.map((domain) => (
              <div key={domain.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {getDomainTypeIcon(domain.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{domain.name}</h3>
                      {domain.isDefault && <Badge variant="outline">Default</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {getDomainStatusBadge(domain.status)}
                      {getVerificationBadge(domain.verification.status)}
                      <span className="text-xs text-gray-500">
                        {domain.statistics.totalUsers} users • {domain.statistics.messagesPerDay} msgs/day
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {domain.type} • Updated {domain.updatedAt.toLocaleDateString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {domain.verification.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerifyDomain(domain)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Verified className="h-4 w-4 mr-1" />
                      Verify
                    </Button>
                  )}
                  
                  <Dialog open={showDetailsModal && selectedDomain?.id === domain.id} onOpenChange={setShowDetailsModal}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDomain(domain)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    {selectedDomain && <DomainDetailsModal domain={selectedDomain} />}
                  </Dialog>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Domain
                      </DropdownMenuItem>
                      {domain.status === "active" ? (
                        <DropdownMenuItem onClick={() => handleUpdateStatus(domain, "suspended")}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Suspend Domain
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleUpdateStatus(domain, "active")}>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Activate Domain
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeleteDomain(domain)}
                        disabled={domain.isDefault}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Domain
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DomainManagement;
