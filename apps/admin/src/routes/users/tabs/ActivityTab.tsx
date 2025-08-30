import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Eye,
  Filter,
  Laptop,
  LogOut,
  MapPin,
  Monitor,
  MoreHorizontal,
  Search,
  Shield,
  ShieldAlert,
  Smartphone,
  Tablet,
  Trash2,
  User,
  Wifi,
} from "lucide-react";
import {
  useUser,
  useUserSessions,
  useUserActivity,
  userDetailAPI,
  type UserSession,
  type UserActivity as UserActivityType,
} from "../../data/users-detail";
import { useAdminToast } from "../../hooks/useAdminToast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActivityTabProps {
  userId: string;
  className?: string;
}

function getDeviceIcon(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("android")
  ) {
    return <Smartphone className="w-4 h-4" />;
  }
  if (ua.includes("tablet") || ua.includes("ipad")) {
    return <Tablet className="w-4 h-4" />;
  }
  return <Monitor className="w-4 h-4" />;
}

function getActivityIcon(action: string) {
  switch (action.toLowerCase()) {
    case "login":
      return <User className="w-4 h-4 text-green-600" />;
    case "logout":
      return <LogOut className="w-4 h-4 text-blue-600" />;
    case "password_change":
      return <Shield className="w-4 h-4 text-orange-600" />;
    case "failed_login":
      return <ShieldAlert className="w-4 h-4 text-red-600" />;
    case "profile_update":
      return <User className="w-4 h-4 text-purple-600" />;
    default:
      return <Activity className="w-4 h-4 text-gray-600" />;
  }
}

function formatUserAgent(userAgent: string): string {
  // Simplified user agent parsing
  if (userAgent.includes("Chrome")) {
    return userAgent.includes("Mobile") ? "Chrome Mobile" : "Chrome Desktop";
  }
  if (userAgent.includes("Firefox")) {
    return userAgent.includes("Mobile") ? "Firefox Mobile" : "Firefox Desktop";
  }
  if (userAgent.includes("Safari")) {
    if (userAgent.includes("iPhone")) return "Safari iPhone";
    if (userAgent.includes("iPad")) return "Safari iPad";
    return "Safari Desktop";
  }
  if (userAgent.includes("Edge")) {
    return "Microsoft Edge";
  }
  return "Unknown Browser";
}

function SessionCard({
  session,
  onTerminate,
}: {
  session: UserSession;
  onTerminate: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-all duration-200",
        session.isCurrent && "ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getDeviceIcon(session.userAgent)}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {formatUserAgent(session.userAgent)}
                </p>
                {session.isCurrent && (
                  <Badge variant="default" className="text-xs">
                    Current Session
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  <span>{session.ipAddress}</span>
                </div>
                {session.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{session.location}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Started: {new Date(session.createdAt).toLocaleString()}
                </span>
                <span>
                  Last active: {new Date(session.lastActive).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          {!session.isCurrent && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onTerminate}
                  className="text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Terminate Session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ activity }: { activity: UserActivityType }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
      {getActivityIcon(activity.action)}
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="font-medium">{activity.description}</p>
          <time className="text-xs text-muted-foreground">
            {new Date(activity.timestamp).toLocaleString()}
          </time>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Wifi className="w-3 h-3" />
            <span>{activity.ipAddress}</span>
          </div>
          <span className="truncate max-w-[200px]" title={activity.userAgent}>
            {formatUserAgent(activity.userAgent)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityFilters({
  onFilterChange,
  onSearchChange,
}: {
  onFilterChange: (filter: string) => void;
  onSearchChange: (search: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const handleApplyFilters = () => {
    onFilterChange(actionFilter);
    onSearchChange(searchTerm);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    setActionFilter("all");
    setSearchTerm("");
    onFilterChange("all");
    onSearchChange("");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter Activity</DialogTitle>
          <DialogDescription>
            Filter the activity log by action type or search for specific events
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Action Type</label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Select action type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="login">Login Events</SelectItem>
                <SelectItem value="logout">Logout Events</SelectItem>
                <SelectItem value="password_change">
                  Password Changes
                </SelectItem>
                <SelectItem value="failed_login">Failed Logins</SelectItem>
                <SelectItem value="profile_update">Profile Updates</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClearFilters}>
            Clear Filters
          </Button>
          <Button onClick={handleApplyFilters}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityTab({ userId, className }: ActivityTabProps) {
  const toast = useAdminToast();
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useUser(userId);
  const {
    data: sessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = useUserSessions(userId);
  const { data: activity, isLoading: activityLoading } =
    useUserActivity(userId);

  const [activityFilter, setActivityFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");

  const handleTerminateSession = async (sessionId: string) => {
    if (
      window.confirm(
        "Are you sure you want to terminate this session? The user will be logged out immediately.",
      )
    ) {
      try {
        await userDetailAPI.terminateSession(userId, sessionId);
        toast.success("Session terminated successfully");
        refetchSessions();
      } catch (error) {
        toast.error("Failed to terminate session: " + (error as Error).message);
      }
    }
  };

  // Filter activity based on current filters
  const filteredActivity =
    activity?.filter((item) => {
      const matchesFilter =
        activityFilter === "all" || item.action === activityFilter;
      const matchesSearch =
        activitySearch === "" ||
        item.description.toLowerCase().includes(activitySearch.toLowerCase()) ||
        item.action.toLowerCase().includes(activitySearch.toLowerCase());

      return matchesFilter && matchesSearch;
    }) || [];

  if (userLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (userError) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load user activity details: {(userError as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const activeSessions = sessions?.filter((s) => s.isCurrent) || [];
  const inactiveSessions = sessions?.filter((s) => !s.isCurrent) || [];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Activity Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Activity Overview
          </CardTitle>
          <CardDescription>
            Current sessions and recent activity for this user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{sessions?.length || 0}</div>
              <div className="text-sm text-muted-foreground">
                Total Sessions
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{activeSessions.length}</div>
              <div className="text-sm text-muted-foreground">
                Active Sessions
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{activity?.length || 0}</div>
              <div className="text-sm text-muted-foreground">
                Recent Activities
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">
                {user.lastLogin
                  ? new Date(user.lastLogin).toLocaleDateString()
                  : "Never"}
              </div>
              <div className="text-sm text-muted-foreground">Last Login</div>
            </div>
          </div>

          {activeSessions.length > 1 && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Multiple Active Sessions</AlertTitle>
              <AlertDescription>
                This user has {activeSessions.length} active sessions. Consider
                reviewing for security purposes.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Active Sessions
              <Badge variant="outline">{activeSessions.length}</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Currently active login sessions for this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : activeSessions.length > 0 ? (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onTerminate={() => handleTerminateSession(session.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active sessions</p>
              <p className="text-sm">User is not currently logged in</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      {inactiveSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Sessions
              <Badge variant="outline">{inactiveSessions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Recently ended sessions and login history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inactiveSessions.slice(0, 5).map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onTerminate={() => handleTerminateSession(session.id)}
                />
              ))}
              {inactiveSessions.length > 5 && (
                <div className="text-center py-4">
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    View All Sessions ({inactiveSessions.length})
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Activity Log
              <Badge variant="outline">{filteredActivity.length}</Badge>
            </div>
            <ActivityFilters
              onFilterChange={setActivityFilter}
              onSearchChange={setActivitySearch}
            />
          </CardTitle>
          <CardDescription>
            Detailed audit log of user actions and security events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : filteredActivity.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredActivity.map((item) => (
                <ActivityItem key={item.id} activity={item} />
              ))}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No matching activities</p>
              <p className="text-sm">
                Try adjusting your filters or search terms
              </p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
              <p className="text-sm">No user activities have been logged yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Insights
          </CardTitle>
          <CardDescription>
            Security-related observations and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Multiple device access */}
            {sessions &&
              new Set(sessions.map((s) => formatUserAgent(s.userAgent))).size >
                3 && (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Multiple Device Access</AlertTitle>
                  <AlertDescription>
                    User accesses from{" "}
                    {
                      new Set(sessions.map((s) => formatUserAgent(s.userAgent)))
                        .size
                    }{" "}
                    different device types. Monitor for unusual access patterns.
                  </AlertDescription>
                </Alert>
              )}

            {/* Multiple IP addresses */}
            {sessions && new Set(sessions.map((s) => s.ipAddress)).size > 2 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Multiple IP Addresses</AlertTitle>
                <AlertDescription>
                  User has accessed from{" "}
                  {new Set(sessions.map((s) => s.ipAddress)).size} different IP
                  addresses. Verify if this is expected behavior.
                </AlertDescription>
              </Alert>
            )}

            {/* Recent password change */}
            {activity?.some(
              (a) =>
                a.action === "password_change" &&
                new Date(a.timestamp).getTime() >
                  Date.now() - 7 * 24 * 60 * 60 * 1000,
            ) && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Recent Password Change</AlertTitle>
                <AlertDescription>
                  User changed their password within the last 7 days. This is
                  good security practice.
                </AlertDescription>
              </Alert>
            )}

            {/* No recent activity */}
            {activity && activity.length === 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Recent Activity</AlertTitle>
                <AlertDescription>
                  No user activity has been recorded. This could indicate an
                  inactive account or logging issues.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
