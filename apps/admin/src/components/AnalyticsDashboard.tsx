import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  getAnalyticsData, 
  acknowledgeAlert,
  resolveAlert,
  type AnalyticsData,
  type AnalyticsFilters,
  type TimeRange,
  type SystemAlert,
  type AlertSeverity
} from "../data/analytics";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Mail,
  Shield,
  HardDrive,
  Server,
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Activity,
  Zap,
  Database,
  Wifi,
  Cpu,
  MemoryStick,
  Timer,
  Gauge
} from "lucide-react";

const AnalyticsDashboard: React.FC = () => {
  const [filters, setFilters] = useState<AnalyticsFilters>({ timeRange: "24h" });
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ["analytics", filters],
    queryFn: () => getAnalyticsData(filters),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleTimeRangeChange = (timeRange: TimeRange) => {
    setFilters(prev => ({ ...prev, timeRange }));
  };

  const handleAlertAction = async (alertId: string, action: "acknowledge" | "resolve") => {
    try {
      if (action === "acknowledge") {
        await acknowledgeAlert(alertId);
      } else {
        await resolveAlert(alertId);
      }
      refetch();
    } catch (error) {
      console.error(`Failed to ${action} alert:`, error);
    }
  };

  const getAlertSeverityBadge = (severity: AlertSeverity) => {
    const severityConfig = {
      critical: { variant: "destructive" as const, icon: AlertTriangle, color: "text-red-600" },
      warning: { variant: "outline" as const, icon: AlertTriangle, color: "text-yellow-600" },
      info: { variant: "secondary" as const, icon: CheckCircle, color: "text-blue-600" }
    };

    const config = severityConfig[severity];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </Badge>
    );
  };

  const getAlertStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "acknowledged":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    if (percentage >= 50) return "bg-blue-500";
    return "bg-green-500";
  };

  const ProgressBar = ({ percentage, label }: { percentage: number; label: string }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );

  const AlertModal = ({ alert }: { alert: SystemAlert }) => (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {getAlertStatusIcon(alert.status)}
          {alert.title}
        </DialogTitle>
        <DialogDescription>
          {alert.source} • {alert.timestamp.toLocaleString()}
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Severity:</span>
          {getAlertSeverityBadge(alert.severity)}
          <span className="text-sm font-medium">Type:</span>
          <Badge variant="outline">{alert.type}</Badge>
        </div>
        
        <div>
          <h4 className="font-semibold mb-2">Message</h4>
          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{alert.message}</p>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          {alert.status === "active" && (
            <Button 
              variant="outline"
              onClick={() => handleAlertAction(alert.id, "acknowledge")}
            >
              Acknowledge
            </Button>
          )}
          {alert.status !== "resolved" && (
            <Button onClick={() => handleAlertAction(alert.id, "resolve")}>
              Resolve
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  );

  if (isLoading || !analytics) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { overview, messageMetrics, userMetrics, securityMetrics, storageMetrics, performanceMetrics, alerts } = analytics;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time insights and system metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={filters.timeRange} onValueChange={(value) => handleTimeRangeChange(value as TimeRange)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{overview.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {overview.activeUsers.toLocaleString()} active ({Math.round((overview.activeUsers / overview.totalUsers) * 100)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages/Day</CardTitle>
            <Mail className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overview.messagesPerDay.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {messageMetrics.deliveryRate}% delivery rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Score</CardTitle>
            <Shield className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{securityMetrics.securityScore}/100</div>
            <p className="text-xs text-muted-foreground">
              {securityMetrics.threatsStopped} threats stopped
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
            <Server className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{overview.systemUptime}%</div>
            <p className="text-xs text-muted-foreground">
              {storageMetrics.usedStorage} GB / {storageMetrics.totalStorage} GB used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Message & User Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Message Metrics
            </CardTitle>
            <CardDescription>Email traffic and delivery statistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{messageMetrics.sentMessages.toLocaleString()}</div>
                <div className="text-sm text-green-700">Sent</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{messageMetrics.receivedMessages.toLocaleString()}</div>
                <div className="text-sm text-blue-700">Received</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{messageMetrics.blockedMessages.toLocaleString()}</div>
                <div className="text-sm text-red-700">Blocked</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{messageMetrics.quarantinedMessages.toLocaleString()}</div>
                <div className="text-sm text-yellow-700">Quarantined</div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Delivery Rate</span>
                <span className="font-medium text-green-600">{messageMetrics.deliveryRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Bounce Rate</span>
                <span className="font-medium text-red-600">{messageMetrics.bounceRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Spam Rate</span>
                <span className="font-medium text-yellow-600">{messageMetrics.spamRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Activity
            </CardTitle>
            <CardDescription>User engagement and growth metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{userMetrics.newUsersToday}</div>
                <div className="text-sm text-blue-700">New Today</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{userMetrics.activeUsersToday.toLocaleString()}</div>
                <div className="text-sm text-green-700">Active Today</div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Growth Rate</span>
                <span className="font-medium text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {userMetrics.userGrowthRate}%
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Domain Distribution</h4>
              <div className="space-y-2">
                {userMetrics.userDistributionByDomain.slice(0, 3).map((domain) => (
                  <div key={domain.domain} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Globe className="h-3 w-3" />
                      {domain.domain}
                    </span>
                    <span className="font-medium">{domain.userCount} users</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              System Performance
            </CardTitle>
            <CardDescription>Server metrics and resource usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar percentage={performanceMetrics.cpuUsage} label="CPU Usage" />
            <ProgressBar percentage={performanceMetrics.memoryUsage} label="Memory Usage" />
            <ProgressBar percentage={performanceMetrics.diskUsage} label="Disk Usage" />
            <ProgressBar percentage={performanceMetrics.serverLoad} label="Server Load" />
            
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="text-sm font-medium">{performanceMetrics.averageResponseTime}ms</div>
                <div className="text-xs text-gray-600">Response Time</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="text-sm font-medium">{performanceMetrics.errorRate}%</div>
                <div className="text-xs text-gray-600">Error Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Overview
            </CardTitle>
            <CardDescription>Threat detection and security metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{securityMetrics.virusDetected}</div>
                <div className="text-sm text-red-700">Virus Detected</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{securityMetrics.phishingBlocked}</div>
                <div className="text-sm text-orange-700">Phishing Blocked</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{securityMetrics.malwareBlocked}</div>
                <div className="text-sm text-purple-700">Malware Blocked</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{securityMetrics.authenticationFailures}</div>
                <div className="text-sm text-yellow-700">Auth Failures</div>
              </div>
            </div>
            
            <div className="text-center p-3 bg-green-50 rounded-lg border">
              <div className="text-3xl font-bold text-green-600">{securityMetrics.securityScore}/100</div>
              <div className="text-sm text-green-700">Overall Security Score</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storage Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage & Backup
          </CardTitle>
          <CardDescription>Storage usage and backup status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Storage Usage</div>
              <ProgressBar percentage={Math.round((storageMetrics.usedStorage / storageMetrics.totalStorage) * 100)} label={`${storageMetrics.usedStorage} GB / ${storageMetrics.totalStorage} GB`} />
            </div>
            
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{storageMetrics.storageGrowthRate}%</div>
              <div className="text-sm text-blue-700">Growth Rate</div>
            </div>
            
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{storageMetrics.backupStatus.backupSize} GB</div>
              <div className="text-sm text-green-700">Last Backup</div>
            </div>
            
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{storageMetrics.backupStatus.retentionDays}</div>
              <div className="text-sm text-purple-700">Retention Days</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            System Alerts ({alerts.filter(a => a.status === "active").length} Active)
          </CardTitle>
          <CardDescription>Recent system alerts and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  {getAlertStatusIcon(alert.status)}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{alert.title}</h4>
                      {getAlertSeverityBadge(alert.severity)}
                    </div>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                    <div className="text-xs text-gray-500 mt-1">
                      {alert.source} • {alert.timestamp.toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Dialog open={showAlertModal && selectedAlert?.id === alert.id} onOpenChange={setShowAlertModal}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedAlert(alert)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    {selectedAlert && <AlertModal alert={selectedAlert} />}
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;
