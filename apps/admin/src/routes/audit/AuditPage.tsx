import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  Download,
  Calendar as CalendarIcon,
  Filter,
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface AuditEventData {
  id: string;
  ts: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: "SUCCESS" | "FAILURE";
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  actor?: {
    id: string;
    email: string;
    name: string;
  } | null;
}

interface AuditEventData {
  id: string;
  ts: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: "SUCCESS" | "FAILURE";
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
  actor?: {
    id: string;
    email: string;
    name: string;
  } | null;
}

interface AuditResponse {
  items: AuditEventData[];
  totalApprox: number;
  nextCursor: string | null;
}

interface AuditFilters {
  q?: string;
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: "SUCCESS" | "FAILURE";
  ip?: string;
  page?: number;
  limit?: number;
}

// Skeleton component for loading state
function AuditTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex space-x-4 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-16" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>
      ))}
    </div>
  );
}

// Filter bar component
function AuditFilterBar({
  filters,
  onFiltersChange,
}: {
  filters: AuditFilters;
  onFiltersChange: (filters: AuditFilters) => void;
}) {
  const [fromDate, setFromDate] = useState<Date | undefined>(
    filters.from ? new Date(filters.from) : undefined,
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    filters.to ? new Date(filters.to) : undefined,
  );

  const handleFilterChange = (
    key: keyof AuditFilters,
    value: string | undefined,
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
      page: 1, // Reset to first page on filter change
    });
  };

  const handleDateRangeChange = (from?: Date, to?: Date) => {
    setFromDate(from);
    setToDate(to);
    onFiltersChange({
      ...filters,
      from: from?.toISOString(),
      to: to?.toISOString(),
      page: 1,
    });
  };

  const clearFilters = () => {
    setFromDate(undefined);
    setToDate(undefined);
    onFiltersChange({ page: 1, limit: filters.limit });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Audit Log Filters
        </CardTitle>
      </CardHeader>
      <CardContent data-testid="audit-filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search events..."
                value={filters.q || ""}
                onChange={(e) => handleFilterChange("q", e.target.value)}
                className="pl-8"
                data-testid="audit-search"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date Range</label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "MMM dd") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(date) => handleDateRangeChange(date, toDate)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "MMM dd") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(date) => handleDateRangeChange(fromDate, date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Actor */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Actor</label>
            <Input
              placeholder="Actor email..."
              value={filters.actor || ""}
              onChange={(e) => handleFilterChange("actor", e.target.value)}
            />
          </div>

          {/* Action */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Action</label>
            <Select
              value={filters.action || ""}
              onValueChange={(value) => handleFilterChange("action", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="user.create">User Create</SelectItem>
                <SelectItem value="user.update">User Update</SelectItem>
                <SelectItem value="user.delete">User Delete</SelectItem>
                <SelectItem value="user.enable">User Enable</SelectItem>
                <SelectItem value="user.disable">User Disable</SelectItem>
                <SelectItem value="user.role_change">
                  User Role Change
                </SelectItem>
                <SelectItem value="user.reset_password">
                  Password Reset
                </SelectItem>
                <SelectItem value="policy.password.save">
                  Password Policy Save
                </SelectItem>
                <SelectItem value="policy.mfa.save">MFA Policy Save</SelectItem>
                <SelectItem value="policy.banner.save">
                  Banner Policy Save
                </SelectItem>
                <SelectItem value="policy.trusted_senders.change">
                  Trusted Senders Change
                </SelectItem>
                <SelectItem value="policy.create">Policy Create</SelectItem>
                <SelectItem value="policy.update">Policy Update</SelectItem>
                <SelectItem value="policy.delete">Policy Delete</SelectItem>
                <SelectItem value="quarantine.release">
                  Quarantine Release
                </SelectItem>
                <SelectItem value="dkim.rotate">DKIM Rotate</SelectItem>
                <SelectItem value="auth.login">Login</SelectItem>
                <SelectItem value="auth.logout">Logout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resource Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Resource Type</label>
            <Select
              value={filters.resourceType || ""}
              onValueChange={(value) =>
                handleFilterChange("resourceType", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="quarantine">Quarantine</SelectItem>
                <SelectItem value="deliverability">Deliverability</SelectItem>
                <SelectItem value="dkim">DKIM</SelectItem>
                <SelectItem value="session">Session</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resource ID */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Resource ID</label>
            <Input
              placeholder="Resource ID..."
              value={filters.resourceId || ""}
              onChange={(e) => handleFilterChange("resourceId", e.target.value)}
            />
          </div>

          {/* Result */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Result</label>
            <Select
              value={filters.result || ""}
              onValueChange={(value) =>
                handleFilterChange("result", value as "SUCCESS" | "FAILURE")
              }
              data-testid="audit-result-filter"
            >
              <SelectTrigger>
                <SelectValue placeholder="All results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILURE">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* IP Address */}
          <div className="space-y-2">
            <label className="text-sm font-medium">IP Address</label>
            <Input
              placeholder="IP address..."
              value={filters.ip || ""}
              onChange={(e) => handleFilterChange("ip", e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <Button variant="outline" onClick={clearFilters}>
            Clear Filters
          </Button>

          <div className="text-sm text-gray-500">
            {
              Object.values(filters).filter((v) => v && v !== 1 && v !== 20)
                .length
            }{" "}
            active filters
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Copy to clipboard utility
async function copyToClipboard(text: string, description: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${description} copied to clipboard`);
  } catch (err) {
    toast.error(`Failed to copy ${description}`);
  }
}

// Result badge component
function ResultBadge({ result }: { result: "SUCCESS" | "FAILURE" }) {
  return (
    <Badge
      variant={result === "SUCCESS" ? "default" : "destructive"}
      className={cn(
        "flex items-center gap-1",
        result === "SUCCESS"
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800",
      )}
    >
      {result === "SUCCESS" ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {result}
    </Badge>
  );
}

// Action link component
function ActionLink({
  action,
  resourceType,
  resourceId,
}: {
  action: string;
  resourceType: string;
  resourceId: string | null;
}) {
  const getActionLink = () => {
    if (resourceType === "user" && resourceId) {
      return `/admin/users/${resourceId}`;
    }
    if (resourceType === "policy" && resourceId) {
      return `/admin/policies/${resourceId}`;
    }
    return null;
  };

  const link = getActionLink();

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="font-mono text-xs">
        {action}
      </Badge>
      {link && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => window.open(link, "_blank")}
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Audit detail drawer
function AuditDetailDrawer({
  auditId,
  open,
  onOpenChange,
}: {
  auditId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { client } = useAdminAuth();
  const {
    data: auditDetail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["audit-detail", auditId],
    queryFn: async () => {
      if (!auditId) return null;
      const result = await client.adminAudit.getAuditById(auditId);
      return result.data;
    },
    enabled: !!auditId && open,
    staleTime: 30_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[600px] sm:w-[700px]"
        data-testid="audit-detail-drawer"
      >
        <SheetHeader>
          <SheetTitle data-testid="audit-detail-title">
            Audit Event Details
          </SheetTitle>
          <SheetDescription>
            Complete audit event information and metadata
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Failed to load audit details. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {auditDetail && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Event ID
                  </label>
                  <div
                    className="flex items-center gap-2 mt-1"
                    data-testid="audit-detail-id"
                  >
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {auditDetail.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        copyToClipboard(auditDetail.id, "Event ID")
                      }
                      data-testid="copy-event-id"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Timestamp
                  </label>
                  <div className="mt-1" data-testid="audit-detail-timestamp">
                    <time className="text-sm">
                      {format(new Date(auditDetail.ts), "PPpp")}
                    </time>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Actor
                  </label>
                  <div className="mt-1">
                    <div className="text-sm">
                      {auditDetail.actorEmail || "System"}
                    </div>
                    {auditDetail.actor && (
                      <div className="text-xs text-gray-500">
                        {auditDetail.actor.name} ({auditDetail.actor.id})
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Result
                  </label>
                  <div className="mt-1">
                    <ResultBadge result={auditDetail.result} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Action
                  </label>
                  <div className="mt-1">
                    <ActionLink
                      action={auditDetail.action}
                      resourceType={auditDetail.resourceType}
                      resourceId={auditDetail.resourceId}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Resource
                  </label>
                  <div className="mt-1">
                    <div className="text-sm">
                      {auditDetail.resourceType}
                      {auditDetail.resourceId && (
                        <span className="text-gray-500">
                          {" "}
                          #{auditDetail.resourceId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {auditDetail.ip && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      IP Address
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {auditDetail.ip}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() =>
                          copyToClipboard(auditDetail.ip!, "IP Address")
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {auditDetail.userAgent && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-500">
                      User Agent
                    </label>
                    <div className="flex items-start gap-2 mt-1">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 break-all">
                        {auditDetail.userAgent}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() =>
                          copyToClipboard(auditDetail.userAgent!, "User Agent")
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              {auditDetail.metadata && (
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Metadata
                  </label>
                  <div className="mt-2">
                    <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-96">
                      {JSON.stringify(auditDetail.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Main audit table component
function AuditTable({ filters }: { filters: AuditFilters }) {
  const { client } = useAdminAuth();
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<AuditResponse>({
    queryKey: ["audit-events", filters],
    queryFn: async () => {
      const result = await client.adminAudit.getAuditEvents(filters);
      return result.data;
    },
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const handleRowClick = (auditId: string) => {
    setSelectedAuditId(auditId);
    setDrawerOpen(true);
  };

  const handleExportCSV = async () => {
    try {
      const result = await client.adminAudit.exportAuditCsv(filters);

      // Create and trigger download
      const blob = new Blob([result.data as string], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CSV export downloaded successfully");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>Failed to load audit events. Please try again.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="error-retry"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Audit Events</CardTitle>
            <div className="flex items-center gap-2">
              {data && (
                <span className="text-sm text-gray-500">
                  {data.totalApprox} total events
                </span>
              )}
              <Button
                onClick={handleExportCSV}
                size="sm"
                data-testid="export-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative min-h-[400px]">
            {isLoading && !data && <AuditTableSkeleton />}

            {data && (
              <Table data-testid="audit-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>IP / UA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((event: AuditEventData) => (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleRowClick(event.id)}
                    >
                      <TableCell>
                        <time className="text-sm">
                          {format(new Date(event.ts), "MMM dd, HH:mm:ss")}
                        </time>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {event.actorEmail || "System"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ActionLink
                          action={event.action}
                          resourceType={event.resourceType}
                          resourceId={event.resourceId}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">
                            {event.resourceType}
                          </span>
                          {event.resourceId && (
                            <div className="text-xs text-gray-500 font-mono">
                              {event.resourceId.length > 8
                                ? `${event.resourceId.substring(0, 8)}...`
                                : event.resourceId}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={event.result} />
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          {event.ip && (
                            <div className="font-mono">{event.ip}</div>
                          )}
                          {event.userAgent && (
                            <div className="text-gray-500 truncate max-w-[150px]">
                              {event.userAgent}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {data?.items.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  No audit events found matching your filters.
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {data?.nextCursor && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  // Implement pagination with cursor
                  // This would update the filters with the nextCursor
                }}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AuditDetailDrawer
        auditId={selectedAuditId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

// Main audit page component
export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: AuditFilters = {
    q: searchParams.get("q") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
    actor: searchParams.get("actor") || undefined,
    action: searchParams.get("action") || undefined,
    resourceType: searchParams.get("resourceType") || undefined,
    resourceId: searchParams.get("resourceId") || undefined,
    result: (searchParams.get("result") as "SUCCESS" | "FAILURE") || undefined,
    ip: searchParams.get("ip") || undefined,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "20"),
  };

  const handleFiltersChange = (newFilters: AuditFilters) => {
    const params = new URLSearchParams();

    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, value.toString());
      }
    });

    setSearchParams(params);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-gray-600 mt-1">
          Monitor and track all administrative actions across CEERION Mail
        </p>
      </div>

      <AuditFilterBar filters={filters} onFiltersChange={handleFiltersChange} />

      <ErrorBoundary
        fallback={
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Something went wrong loading the audit log. Please refresh the
              page.
            </AlertDescription>
          </Alert>
        }
      >
        <Suspense fallback={<AuditTableSkeleton />}>
          <AuditTable filters={filters} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
