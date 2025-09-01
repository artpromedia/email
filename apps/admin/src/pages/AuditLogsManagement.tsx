import { useState } from "react";
import {
  FileText,
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
  getAuditLogs,
  getAuditStats,
  exportAuditLogs,
  type AuditLog,
  type AuditFilters,
  type AuditAction,
  type AuditSeverity,
  type AuditOutcome,
} from "../data/auditLogs";

export default function AuditLogsManagement() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch audit data
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["auditLogs", filters],
    queryFn: () => getAuditLogs(filters),
  });

  const { data: stats } = useQuery({
    queryKey: ["auditStats"],
    queryFn: getAuditStats,
  });

  // Handle search
  const handleSearch = () => {
    setFilters({ ...filters, search: searchQuery });
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters({ ...filters, [key]: value === "all" ? undefined : value });
  };

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportAuditLogs(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Audit logs exported successfully");
    } catch (error) {
      alert("Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  // Get severity badge styling
  const getSeverityBadge = (severity: AuditSeverity) => {
    const styles: Record<AuditSeverity, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };
    return styles[severity];
  };

  // Get outcome badge styling
  const getOutcomeBadge = (outcome: AuditOutcome) => {
    const styles: Record<AuditOutcome, string> = {
      success: "bg-green-100 text-green-800",
      failure: "bg-red-100 text-red-800",
      warning: "bg-yellow-100 text-yellow-800",
    };
    return styles[outcome];
  };

  // Get outcome icon
  const getOutcomeIcon = (outcome: AuditOutcome) => {
    switch (outcome) {
      case "success":
        return <CheckCircle className="h-4 w-4" />;
      case "failure":
        return <XCircle className="h-4 w-4" />;
      case "warning":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  // Get action icon
  const getActionIcon = (action: AuditAction) => {
    if (action.includes("user")) return <User className="h-4 w-4" />;
    if (action.includes("message")) return <FileText className="h-4 w-4" />;
    if (action.includes("login") || action.includes("logout"))
      return <Shield className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  // Format action name for display
  const formatAction = (action: AuditAction) => {
    return action
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        </div>
        <Button
          onClick={handleExport}
          disabled={isExporting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? "Exporting..." : "Export Logs"}
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Total Logs
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalLogs}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Today</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.todayLogs}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Critical Events
                  </p>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.criticalEvents}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Failed Actions
                  </p>
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.failedActions}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Date Range */}
            <div>
              <Input
                type="date"
                value={filters.startDate || ""}
                onChange={(e) =>
                  handleFilterChange("startDate", e.target.value)
                }
                placeholder="Start Date"
              />
            </div>

            <div>
              <Input
                type="date"
                value={filters.endDate || ""}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
                placeholder="End Date"
              />
            </div>

            {/* Action Filter */}
            <div>
              <Select
                value={filters.action || "all"}
                onValueChange={(value) => handleFilterChange("action", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="user_created">User Created</SelectItem>
                  <SelectItem value="user_updated">User Updated</SelectItem>
                  <SelectItem value="user_deleted">User Deleted</SelectItem>
                  <SelectItem value="message_released">
                    Message Released
                  </SelectItem>
                  <SelectItem value="message_deleted">
                    Message Deleted
                  </SelectItem>
                  <SelectItem value="login_success">Login Success</SelectItem>
                  <SelectItem value="login_failed">Login Failed</SelectItem>
                  <SelectItem value="settings_updated">
                    Settings Updated
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Severity Filter */}
            <div>
              <Select
                value={filters.severity || "all"}
                onValueChange={(value) => handleFilterChange("severity", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button onClick={handleSearch} className="px-6">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFilters({});
                setSearchQuery("");
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Admin
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Resource
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Details
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Outcome
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-4 w-4 text-gray-400" />
                          {formatDate(log.timestamp)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {log.adminName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {log.adminEmail}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          <span className="text-sm font-medium">
                            {formatAction(log.action)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {log.resource}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p
                          className="text-sm text-gray-900 truncate max-w-xs"
                          title={log.details}
                        >
                          {log.details}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getSeverityBadge(log.severity)}>
                          {log.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {getOutcomeIcon(log.outcome)}
                          <Badge className={getOutcomeBadge(log.outcome)}>
                            {log.outcome}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {logs.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No audit logs found
              </h3>
              <p className="text-gray-600">
                Try adjusting your filters or search criteria.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-6">
              {/* Log Overview */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Timestamp:
                  </label>
                  <p className="text-sm">{formatDate(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Admin:
                  </label>
                  <p className="text-sm font-medium">{selectedLog.adminName}</p>
                  <p className="text-xs text-gray-500">
                    {selectedLog.adminEmail}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Action:
                  </label>
                  <div className="flex items-center gap-2">
                    {getActionIcon(selectedLog.action)}
                    <span className="text-sm">
                      {formatAction(selectedLog.action)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Resource:
                  </label>
                  <Badge variant="outline">{selectedLog.resource}</Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Severity:
                  </label>
                  <Badge className={getSeverityBadge(selectedLog.severity)}>
                    {selectedLog.severity}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Outcome:
                  </label>
                  <div className="flex items-center gap-1">
                    {getOutcomeIcon(selectedLog.outcome)}
                    <Badge className={getOutcomeBadge(selectedLog.outcome)}>
                      {selectedLog.outcome}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    IP Address:
                  </label>
                  <p className="text-sm">{selectedLog.ipAddress}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Resource ID:
                  </label>
                  <p className="text-sm">{selectedLog.resourceId || "N/A"}</p>
                </div>
              </div>

              {/* Details */}
              <div>
                <h3 className="text-lg font-medium mb-2">Details</h3>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-700">{selectedLog.details}</p>
                </div>
              </div>

              {/* Metadata */}
              {selectedLog.metadata &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Metadata</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

              {/* User Agent */}
              <div>
                <h3 className="text-lg font-medium mb-2">User Agent</h3>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-xs text-gray-600 break-all">
                    {selectedLog.userAgent}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
