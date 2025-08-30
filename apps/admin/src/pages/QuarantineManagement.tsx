import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { toast } from "react-hot-toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { PendingButton } from "../components/ui/pending-button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Shield,
  Download,
  Check,
  Trash2,
  UserCheck,
  Eye,
  Filter,
  MoreHorizontal,
  AlertTriangle,
  Bug,
  FileText,
  Calendar,
  Mail,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useConfirm } from "../hooks/useConfirm";
import { createCeerionMailClient } from "@ceerion/sdk";
import { createMockAdminClient } from "../lib/mockAdminClient";
import {
  QuarantinedEmail,
  QuarantineFilters,
  QuarantineStats,
} from "../types/quarantine";

// Mock data for development
const mockQuarantinedEmails: QuarantinedEmail[] = [
  {
    id: "quar-001",
    date: "2025-08-29T10:30:00Z",
    sender: "suspicious@malware-site.com",
    subject: "Urgent: Your account has been compromised!",
    recipient: "user1@ceerion.com",
    score: 95,
    reason: "malware",
    size: 2048,
    domain: "malware-site.com",
    headers: {
      From: "suspicious@malware-site.com",
      To: "user1@ceerion.com",
      Subject: "Urgent: Your account has been compromised!",
      "X-Spam-Score": "95",
      "X-Virus-Scanner": "ClamAV detected Trojan.Generic",
    },
    rawContent: "MIME-Version: 1.0\nFrom: suspicious@malware-site.com...",
  },
  {
    id: "quar-002",
    date: "2025-08-29T09:15:00Z",
    sender: "noreply@spammer.net",
    subject: "Free Bitcoin - Click Here Now!",
    recipient: "user2@ceerion.com",
    score: 87,
    reason: "spam",
    size: 1536,
    domain: "spammer.net",
    headers: {
      From: "noreply@spammer.net",
      To: "user2@ceerion.com",
      Subject: "Free Bitcoin - Click Here Now!",
      "X-Spam-Score": "87",
    },
    rawContent: "MIME-Version: 1.0\nFrom: noreply@spammer.net...",
  },
  {
    id: "quar-003",
    date: "2025-08-29T08:45:00Z",
    sender: "external@competitor.com",
    subject: "Confidential Business Proposal",
    recipient: "ceo@ceerion.com",
    score: 72,
    reason: "policy",
    size: 3072,
    domain: "competitor.com",
    headers: {
      From: "external@competitor.com",
      To: "ceo@ceerion.com",
      Subject: "Confidential Business Proposal",
      "X-Policy-Violation": "External sender to executive",
    },
    rawContent: "MIME-Version: 1.0\nFrom: external@competitor.com...",
  },
];

const mockStats: QuarantineStats = {
  total: 156,
  spam: 89,
  malware: 23,
  policy: 44,
  todayCount: 12,
  avgScore: 78.5,
};

function QuarantineManagement() {
  const [emails, setEmails] = useState<QuarantinedEmail[]>(
    mockQuarantinedEmails,
  );
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<QuarantineFilters>({
    dateRange: {
      start: format(subDays(new Date(), 7), "yyyy-MM-dd"),
      end: format(new Date(), "yyyy-MM-dd"),
    },
    reason: [],
    recipient: "",
    sender: "",
    domain: "",
    scoreRange: { min: 0, max: 100 },
    page: 1,
    limit: 50,
  });
  const [stats, setStats] = useState<QuarantineStats>(mockStats);
  const [isLoading, setIsLoading] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<QuarantinedEmail | null>(
    null,
  );
  const [bulkProgress, setBulkProgress] = useState<{
    show: boolean;
    progress: number;
    total: number;
  }>({
    show: false,
    progress: 0,
    total: 0,
  });

  // const client = createCeerionMailClient({
  //   baseUrl: "http://localhost:4000",
  //   headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
  // });

  // const adminClient = createMockAdminClient();

  const { show: confirm } = useConfirm();

  // Load quarantined emails
  const loadEmails = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with real API call
      // const response = await client.admin.quarantine.list({
      //   dateStart: filters.dateRange.start || undefined,
      //   dateEnd: filters.dateRange.end || undefined,
      //   reason: filters.reason.length > 0 ? filters.reason : undefined,
      //   recipient: filters.recipient || undefined,
      //   sender: filters.sender || undefined,
      //   domain: filters.domain || undefined,
      //   scoreMin: filters.scoreRange.min,
      //   scoreMax: filters.scoreRange.max,
      //   page: filters.page,
      //   limit: filters.limit,
      // });

      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Apply filters to mock data
      let filteredEmails = mockQuarantinedEmails;

      if (filters.reason.length > 0) {
        filteredEmails = filteredEmails.filter((email) =>
          filters.reason.includes(email.reason),
        );
      }

      if (filters.recipient) {
        filteredEmails = filteredEmails.filter((email) =>
          email.recipient
            .toLowerCase()
            .includes(filters.recipient.toLowerCase()),
        );
      }

      if (filters.sender) {
        filteredEmails = filteredEmails.filter((email) =>
          email.sender.toLowerCase().includes(filters.sender.toLowerCase()),
        );
      }

      if (filters.domain) {
        filteredEmails = filteredEmails.filter((email) =>
          email.domain.toLowerCase().includes(filters.domain.toLowerCase()),
        );
      }

      setEmails(filteredEmails);
    } catch (error) {
      toast.error("Failed to load quarantined emails");
      console.error("Load emails error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      // TODO: Replace with real API call
      // const response = await client.admin.quarantine.stats();
      setStats(mockStats);
    } catch (error) {
      console.error("Load stats error:", error);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Handle individual email actions
  const handleRelease = async (emailId: string) => {
    try {
      // TODO: Replace with real API call
      // await client.admin.quarantine.release(emailId);

      setEmails((prev) => prev.filter((email) => email.id !== emailId));
      setSelectedEmails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(emailId);
        return newSet;
      });
      toast.success("Email released successfully");
    } catch (error) {
      toast.error("Failed to release email");
      console.error("Release error:", error);
    }
  };

  const handleDelete = async (emailId: string) => {
    const confirmed = await confirm({
      title: "Delete Email",
      message: "Are you sure you want to permanently delete this email?",
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      // TODO: Replace with real API call
      // await client.admin.quarantine.delete(emailId);

      setEmails((prev) => prev.filter((email) => email.id !== emailId));
      setSelectedEmails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(emailId);
        return newSet;
      });
      toast.success("Email deleted successfully");
    } catch (error) {
      toast.error("Failed to delete email");
      console.error("Delete error:", error);
    }
  };

  const handleAllowlist = async (emailId: string) => {
    try {
      // TODO: Replace with real API call
      // await client.admin.quarantine.allowlist(emailId);

      const email = emails.find((e) => e.id === emailId);
      if (email) {
        toast.success(`Added ${email.sender} to trusted senders`);
      }
    } catch (error) {
      toast.error("Failed to add sender to allowlist");
      console.error("Allowlist error:", error);
    }
  };

  const handleDownloadEml = async (emailId: string) => {
    try {
      // TODO: Replace with real API call
      // const response = await client.admin.quarantine.downloadEml(emailId);

      const email = emails.find((e) => e.id === emailId);
      if (email) {
        const blob = new Blob([email.rawContent], { type: "message/rfc822" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quarantine-${email.id}.eml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("EML file downloaded");
      }
    } catch (error) {
      toast.error("Failed to download EML file");
      console.error("Download error:", error);
    }
  };

  // Handle bulk actions
  const handleBulkAction = async (
    action: "release" | "delete" | "allowlist",
  ) => {
    const selectedIds = Array.from(selectedEmails);
    if (selectedIds.length === 0) return;

    let confirmed = true;
    if (action === "delete") {
      confirmed = await confirm({
        title: "Bulk Delete",
        message: `Are you sure you want to permanently delete ${selectedIds.length} emails?`,
        confirmText: "Delete All",
        variant: "destructive",
      });
    }

    if (!confirmed) return;

    setBulkProgress({ show: true, progress: 0, total: selectedIds.length });

    try {
      // TODO: Replace with real API calls
      let successCount = 0;
      const failures: Array<{ id: string; error: string }> = [];

      for (let i = 0; i < selectedIds.length; i++) {
        const emailId = selectedIds[i];
        try {
          // Simulate API call delay
          await new Promise((resolve) => setTimeout(resolve, 200));

          if (action === "release") {
            // await client.admin.quarantine.release(emailId);
          } else if (action === "delete") {
            // await client.admin.quarantine.delete(emailId);
          } else if (action === "allowlist") {
            // await client.admin.quarantine.allowlist(emailId);
          }

          successCount++;
        } catch (error) {
          failures.push({ id: emailId, error: "Operation failed" });
        }

        setBulkProgress((prev) => ({ ...prev, progress: i + 1 }));
      }

      // Update UI based on results
      if (action === "release" || action === "delete") {
        setEmails((prev) =>
          prev.filter((email) => !selectedIds.includes(email.id)),
        );
      }
      setSelectedEmails(new Set());

      // Show results
      const actionText =
        action === "release"
          ? "released"
          : action === "delete"
            ? "deleted"
            : "allowlisted";
      if (failures.length === 0) {
        toast.success(`Successfully ${actionText} ${successCount} emails`);
      } else {
        toast.error(
          `${successCount} emails ${actionText}, ${failures.length} failed`,
        );
      }
    } catch (error) {
      toast.error(`Bulk ${action} operation failed`);
      console.error("Bulk action error:", error);
    } finally {
      setBulkProgress({ show: false, progress: 0, total: 0 });
    }
  };

  // Handle selection
  const handleSelectAll = () => {
    if (selectedEmails.size === emails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(emails.map((email) => email.id)));
    }
  };

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  // Utility functions
  const getReasonIcon = (reason: string) => {
    switch (reason) {
      case "spam":
        return <Mail className="h-4 w-4" />;
      case "malware":
        return <Bug className="h-4 w-4" />;
      case "policy":
        return <Shield className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case "spam":
        return "bg-yellow-100 text-yellow-800";
      case "malware":
        return "bg-red-100 text-red-800";
      case "policy":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-red-600";
    if (score >= 70) return "text-orange-600";
    return "text-yellow-600";
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Quarantine Management
        </h1>
        <p className="text-gray-600">
          Manage quarantined emails with bulk operations and detailed filtering
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Shield className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Spam</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {stats.spam}
                </p>
              </div>
              <Mail className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Malware</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.malware}
                </p>
              </div>
              <Bug className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Policy</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.policy}
                </p>
              </div>
              <FileText className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Today</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.todayCount}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Score</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats.avgScore}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filters.dateRange.start || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, start: e.target.value },
                    }))
                  }
                />
                <Input
                  type="date"
                  value={filters.dateRange.end || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, end: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select
                value={filters.reason.join(",")}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    reason: value
                      ? (value.split(",") as ("spam" | "malware" | "policy")[])
                      : [],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All reasons</SelectItem>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="malware">Malware</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sender */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sender</label>
              <Input
                placeholder="sender@domain.com"
                value={filters.sender}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, sender: e.target.value }))
                }
              />
            </div>

            {/* Recipient */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Recipient</label>
              <Input
                placeholder="user@ceerion.com"
                value={filters.recipient}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, recipient: e.target.value }))
                }
              />
            </div>

            {/* Domain */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain</label>
              <Input
                placeholder="suspicious-domain.com"
                value={filters.domain}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, domain: e.target.value }))
                }
              />
            </div>

            {/* Score Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Score Range</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  min="0"
                  max="100"
                  value={filters.scoreRange.min}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      scoreRange: {
                        ...prev.scoreRange,
                        min: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
                <Input
                  type="number"
                  placeholder="Max"
                  min="0"
                  max="100"
                  value={filters.scoreRange.max}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      scoreRange: {
                        ...prev.scoreRange,
                        max: parseInt(e.target.value) || 100,
                      },
                    }))
                  }
                />
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex gap-2">
                <PendingButton
                  onClick={loadEmails}
                  variant="outline"
                  size="sm"
                  isPending={isLoading}
                  pendingText="Loading..."
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </PendingButton>
                <Button
                  onClick={() =>
                    setFilters({
                      dateRange: { start: null, end: null },
                      reason: [],
                      recipient: "",
                      sender: "",
                      domain: "",
                      scoreRange: { min: 0, max: 100 },
                      page: 1,
                      limit: 50,
                    })
                  }
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedEmails.size > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedEmails.size} email
                  {selectedEmails.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleBulkAction("release")}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Release All
                </Button>
                <Button
                  onClick={() => handleBulkAction("allowlist")}
                  size="sm"
                  variant="outline"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Allowlist All
                </Button>
                <Button
                  onClick={() => handleBulkAction("delete")}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Progress */}
      {bulkProgress.show && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing bulk operation...</span>
                <span>
                  {bulkProgress.progress} / {bulkProgress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(bulkProgress.progress / bulkProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Quarantined Emails ({emails.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={
                  selectedEmails.size === emails.length && emails.length > 0
                }
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm text-gray-600">Select All</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No quarantined emails found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="pb-3 w-12">
                      <Checkbox
                        checked={selectedEmails.size === emails.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Date
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Sender
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Subject
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Recipient
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Score
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Reason
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Size
                    </th>
                    <th className="pb-3 text-sm font-medium text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((email) => (
                    <tr key={email.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <Checkbox
                          checked={selectedEmails.has(email.id)}
                          onCheckedChange={() => handleSelectEmail(email.id)}
                        />
                      </td>
                      <td className="py-3 text-sm">
                        {format(new Date(email.date), "MMM dd, HH:mm")}
                      </td>
                      <td className="py-3 text-sm font-medium">
                        {email.sender}
                      </td>
                      <td
                        className="py-3 text-sm max-w-xs truncate"
                        title={email.subject}
                      >
                        {email.subject}
                      </td>
                      <td className="py-3 text-sm">{email.recipient}</td>
                      <td className="py-3">
                        <span
                          className={`text-sm font-medium ${getScoreColor(email.score)}`}
                        >
                          {email.score}
                        </span>
                      </td>
                      <td className="py-3">
                        <Badge
                          className={`${getReasonColor(email.reason)} text-xs`}
                        >
                          <span className="flex items-center gap-1">
                            {getReasonIcon(email.reason)}
                            {email.reason}
                          </span>
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-gray-600">
                        {formatBytes(email.size)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => setPreviewEmail(email)}
                            size="sm"
                            variant="ghost"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleRelease(email.id)}
                            size="sm"
                            variant="ghost"
                            title="Release"
                            className="text-green-600 hover:text-green-700"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleAllowlist(email.id)}
                              >
                                <UserCheck className="h-4 w-4 mr-2" />
                                Allowlist Sender
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDownloadEml(email.id)}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download EML
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(email.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Preview Dialog */}
      <Dialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {previewEmail && (
            <div className="space-y-4">
              {/* Email Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    From:
                  </label>
                  <p className="text-sm">{previewEmail.sender}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    To:
                  </label>
                  <p className="text-sm">{previewEmail.recipient}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Subject:
                  </label>
                  <p className="text-sm">{previewEmail.subject}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Date:
                  </label>
                  <p className="text-sm">
                    {format(new Date(previewEmail.date), "PPpp")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Score:
                  </label>
                  <p
                    className={`text-sm font-medium ${getScoreColor(previewEmail.score)}`}
                  >
                    {previewEmail.score}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Reason:
                  </label>
                  <Badge
                    className={`${getReasonColor(previewEmail.reason)} text-xs`}
                  >
                    {previewEmail.reason}
                  </Badge>
                </div>
              </div>

              {/* Headers */}
              <div>
                <h3 className="text-lg font-medium mb-2">Headers</h3>
                <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                    {Object.entries(previewEmail.headers)
                      .map(([key, value]) => `${key}: ${value}\n`)
                      .join("")}
                  </pre>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => {
                    handleRelease(previewEmail.id);
                    setPreviewEmail(null);
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Release
                </Button>
                <Button
                  onClick={() => {
                    handleAllowlist(previewEmail.id);
                  }}
                  variant="outline"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Allowlist Sender
                </Button>
                <Button
                  onClick={() => handleDownloadEml(previewEmail.id)}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download EML
                </Button>
                <Button
                  onClick={() => {
                    handleDelete(previewEmail.id);
                    setPreviewEmail(null);
                  }}
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default QuarantineManagement;
