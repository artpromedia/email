"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Flag,
  TrendingUp,
  TrendingDown,
  Users,
  Mail,
  RefreshCw,
  Download,
  Settings,
  Eye,
  Ban,
  CheckCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

interface ThreatDashboardProps {
  orgId: string;
}

interface DashboardData {
  spam_stats: SpamStats;
  phishing_stats: PhishingStats;
  reputation_stats: ReputationStats;
  feedback_stats: FeedbackStats;
  recent_threats: RecentThreat[];
  top_blocked_senders: BlockedSender[];
  trend_data: TrendData;
}

interface SpamStats {
  total_checked: number;
  spam_detected: number;
  spam_rate: number;
  quarantined: number;
  blocked: number;
}

interface PhishingStats {
  total_checked: number;
  phishing_detected: number;
  phishing_rate: number;
  brands_targeted: number;
  high_severity: number;
}

interface ReputationStats {
  total_senders: number;
  trusted_senders: number;
  suspicious_senders: number;
  blocked_senders: number;
  avg_reputation: number;
  spam_rate: number;
  phish_rate: number;
}

interface FeedbackStats {
  total_feedback: number;
  spam_reports: number;
  not_spam_reports: number;
  phishing_reports: number;
  false_positive_rate: number;
  false_negative_rate: number;
}

interface RecentThreat {
  id: string;
  type: "spam" | "phishing";
  severity: "low" | "medium" | "high" | "critical";
  subject: string;
  sender_email: string;
  detected_at: string;
  action: string;
}

interface BlockedSender {
  email: string;
  domain: string;
  block_count: number;
  reason: string;
  reputation: number;
}

interface TrendData {
  labels: string[];
  spam_counts: number[];
  phish_counts: number[];
  ham_counts: number[];
}

// ============================================================
// THREAT DASHBOARD COMPONENT
// ============================================================

export function ThreatDashboard({ orgId }: Readonly<ThreatDashboardProps>) {
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/threat/dashboard/${orgId}?period=${period}`);
      if (response.ok) {
        const result = (await response.json()) as DashboardData;
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId, period]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const exportReport = () => {
    // Generate CSV report with current dashboard data
    const csvData = generateCSVReport(dashboardData, period);
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `threat-report-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    // NOTE: For PDF export, integrate a library like jsPDF or pdfmake
    // Example: const pdf = new jsPDF(); pdf.text('Threat Report', 10, 10); pdf.save('report.pdf');
  };

  // Helper function to generate CSV from dashboard data
  const generateCSVReport = (data: typeof dashboardData, period: string): string => {
    const lines: string[] = [
      "Threat Intelligence Report",
      `Generated: ${new Date().toISOString()}`,
      `Period: ${period}`,
      "",
      "Summary Statistics",
      `Total Threats Detected,${data.summary.totalThreats}`,
      `Blocked Attempts,${data.summary.blocked}`,
      `High Severity Threats,${data.summary.highSeverity}`,
      `Active Investigations,${data.summary.investigations}`,
      "",
      "Threat Types",
      "Type,Count,Percentage",
      ...data.threatTypes.map(
        (t) => `${t.type},${t.count},${((t.count / data.summary.totalThreats) * 100).toFixed(1)}%`
      ),
      "",
      "Recent Threats",
      "Time,Type,Severity,Source,Status",
      ...data.recentThreats.map(
        (t) => `${t.timestamp},${t.type},${t.severity},${t.source},${t.status}`
      ),
    ];

    return lines.join("\n");
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Use mock data if no data loaded
  const dashboardData = data ?? getMockData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Threat Protection</h1>
          <p className="text-muted-foreground">
            Monitor spam, phishing, and security threats across your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchDashboardData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Spam Blocked"
          value={dashboardData.spam_stats.spam_detected}
          total={dashboardData.spam_stats.total_checked}
          percentage={dashboardData.spam_stats.spam_rate * 100}
          icon={ShieldAlert}
          color="orange"
          trend={-2.5}
        />
        <StatsCard
          title="Phishing Detected"
          value={dashboardData.phishing_stats.phishing_detected}
          total={dashboardData.phishing_stats.total_checked}
          percentage={dashboardData.phishing_stats.phishing_rate * 100}
          icon={Flag}
          color="red"
          trend={1.2}
        />
        <StatsCard
          title="Trusted Senders"
          value={dashboardData.reputation_stats.trusted_senders}
          total={dashboardData.reputation_stats.total_senders}
          percentage={
            (dashboardData.reputation_stats.trusted_senders /
              dashboardData.reputation_stats.total_senders) *
            100
          }
          icon={ShieldCheck}
          color="green"
          trend={5.3}
        />
        <StatsCard
          title="User Reports"
          value={dashboardData.feedback_stats.total_feedback}
          description="spam & phishing reports"
          icon={Users}
          color="blue"
          trend={12.1}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="threats">Recent Threats</TabsTrigger>
          <TabsTrigger value="senders">Sender Reputation</TabsTrigger>
          <TabsTrigger value="feedback">User Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Threat Trends</CardTitle>
                <CardDescription>Daily spam and phishing detections</CardDescription>
              </CardHeader>
              <CardContent>
                <ThreatTrendChart data={dashboardData.trend_data} />
              </CardContent>
            </Card>

            {/* Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Email Classification</CardTitle>
                <CardDescription>Breakdown of email verdicts</CardDescription>
              </CardHeader>
              <CardContent>
                <ClassificationPieChart
                  spam={dashboardData.spam_stats.spam_detected}
                  phishing={dashboardData.phishing_stats.phishing_detected}
                  clean={
                    dashboardData.spam_stats.total_checked -
                    dashboardData.spam_stats.spam_detected -
                    dashboardData.phishing_stats.phishing_detected
                  }
                />
              </CardContent>
            </Card>
          </div>

          {/* Detection Accuracy */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detection Accuracy</CardTitle>
              <CardDescription>Based on user feedback and corrections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>False Positive Rate</span>
                    <span className="font-medium">
                      {(dashboardData.feedback_stats.false_positive_rate * 100).toFixed(2)}%
                    </span>
                  </div>
                  <Progress
                    value={dashboardData.feedback_stats.false_positive_rate * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Legitimate emails incorrectly marked as spam
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>False Negative Rate</span>
                    <span className="font-medium">
                      {(dashboardData.feedback_stats.false_negative_rate * 100).toFixed(2)}%
                    </span>
                  </div>
                  <Progress
                    value={dashboardData.feedback_stats.false_negative_rate * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">Spam/phishing that reached inbox</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="threats">
          <Card>
            <CardHeader>
              <CardTitle>Recent Threats</CardTitle>
              <CardDescription>Latest detected spam and phishing attempts</CardDescription>
            </CardHeader>
            <CardContent>
              <RecentThreatsTable threats={dashboardData.recent_threats} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="senders">
          <Card>
            <CardHeader>
              <CardTitle>Top Blocked Senders</CardTitle>
              <CardDescription>Senders with highest block rates</CardDescription>
            </CardHeader>
            <CardContent>
              <BlockedSendersTable senders={dashboardData.top_blocked_senders} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle>User Feedback Summary</CardTitle>
              <CardDescription>Reports and corrections from users</CardDescription>
            </CardHeader>
            <CardContent>
              <FeedbackSummary stats={dashboardData.feedback_stats} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface StatsCardProps {
  title: string;
  value: number;
  total?: number;
  percentage?: number;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "green" | "red" | "orange" | "blue";
  trend?: number;
}

function StatsCard({
  title,
  value,
  total,
  percentage,
  description,
  icon: Icon,
  color,
  trend,
}: Readonly<StatsCardProps>) {
  const colorClasses = {
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
    orange: "text-orange-600 bg-orange-50",
    blue: "text-blue-600 bg-blue-50",
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{value.toLocaleString()}</span>
              {total && (
                <span className="text-sm text-muted-foreground">/ {total.toLocaleString()}</span>
              )}
            </div>
            {percentage !== undefined && (
              <p className="text-sm text-muted-foreground">{percentage.toFixed(1)}% of total</p>
            )}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            {trend !== undefined && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs",
                  trend > 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(trend)}% vs last period
              </div>
            )}
          </div>
          <div className={cn("rounded-lg p-3", colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ThreatTrendChart({ data }: Readonly<{ data: TrendData }>) {
  const chartData = data.labels.map((label, i) => ({
    name: label,
    spam: data.spam_counts[i] ?? 0,
    phishing: data.phish_counts[i] ?? 0,
    clean: data.ham_counts[i] ?? 0,
  }));

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="spam"
            stroke="hsl(var(--warning))"
            strokeWidth={2}
            dot={false}
            name="Spam"
          />
          <Line
            type="monotone"
            dataKey="phishing"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={false}
            name="Phishing"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClassificationPieChart({
  spam,
  phishing,
  clean,
}: Readonly<{
  spam: number;
  phishing: number;
  clean: number;
}>) {
  const data = [
    { name: "Clean", value: clean, color: "#22c55e" },
    { name: "Spam", value: spam, color: "#f97316" },
    { name: "Phishing", value: phishing, color: "#ef4444" },
  ];

  return (
    <div className="flex h-[300px] items-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={`cell-${entry.name}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm">{item.name}</span>
            <span className="text-sm font-medium">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentThreatsTable({ threats }: Readonly<{ threats: RecentThreat[] }>) {
  const severityColors = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Sender</TableHead>
          <TableHead>Detected</TableHead>
          <TableHead>Action</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {threats.map((threat) => (
          <TableRow key={threat.id}>
            <TableCell>
              <Badge variant="outline">
                {threat.type === "phishing" ? (
                  <Flag className="mr-1 h-3 w-3 text-red-500" />
                ) : (
                  <ShieldAlert className="mr-1 h-3 w-3 text-orange-500" />
                )}
                {threat.type}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge className={severityColors[threat.severity]}>{threat.severity}</Badge>
            </TableCell>
            <TableCell className="max-w-[200px] truncate">{threat.subject}</TableCell>
            <TableCell className="max-w-[200px] truncate">{threat.sender_email}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(threat.detected_at).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{threat.action}</Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BlockedSendersTable({ senders }: Readonly<{ senders: BlockedSender[] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sender</TableHead>
          <TableHead>Domain</TableHead>
          <TableHead>Block Count</TableHead>
          <TableHead>Reputation</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {senders.map((sender) => (
          <TableRow key={sender.email}>
            <TableCell className="max-w-[200px] truncate font-medium">{sender.email}</TableCell>
            <TableCell>{sender.domain}</TableCell>
            <TableCell>{sender.block_count}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={sender.reputation * 100} className="h-2 w-16" />
                <span className="text-sm">{(sender.reputation * 100).toFixed(0)}%</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{sender.reason}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" title="Unblock">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </Button>
                <Button variant="ghost" size="sm" title="Permanently block">
                  <Ban className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FeedbackSummary({ stats }: Readonly<{ stats: FeedbackStats }>) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div className="rounded-lg bg-muted p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          <span className="text-sm">Spam Reports</span>
        </div>
        <p className="text-2xl font-bold">{stats.spam_reports}</p>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm">Not Spam</span>
        </div>
        <p className="text-2xl font-bold">{stats.not_spam_reports}</p>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Flag className="h-4 w-4" />
          <span className="text-sm">Phishing Reports</span>
        </div>
        <p className="text-2xl font-bold">{stats.phishing_reports}</p>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Mail className="h-4 w-4" />
          <span className="text-sm">Total Feedback</span>
        </div>
        <p className="text-2xl font-bold">{stats.total_feedback}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// Mock data for development
function getMockData(): DashboardData {
  return {
    spam_stats: {
      total_checked: 125000,
      spam_detected: 8750,
      spam_rate: 0.07,
      quarantined: 5200,
      blocked: 3550,
    },
    phishing_stats: {
      total_checked: 125000,
      phishing_detected: 312,
      phishing_rate: 0.0025,
      brands_targeted: 15,
      high_severity: 45,
    },
    reputation_stats: {
      total_senders: 8500,
      trusted_senders: 6200,
      suspicious_senders: 850,
      blocked_senders: 320,
      avg_reputation: 0.72,
      spam_rate: 0.07,
      phish_rate: 0.0025,
    },
    feedback_stats: {
      total_feedback: 1250,
      spam_reports: 890,
      not_spam_reports: 245,
      phishing_reports: 115,
      false_positive_rate: 0.012,
      false_negative_rate: 0.008,
    },
    recent_threats: [
      {
        id: "1",
        type: "phishing",
        severity: "critical",
        subject: "Urgent: Your account will be suspended",
        sender_email: "security@paypa1-verify.com",
        detected_at: new Date().toISOString(),
        action: "blocked",
      },
      {
        id: "2",
        type: "spam",
        severity: "medium",
        subject: "You won $1,000,000!!!",
        sender_email: "winner@lottery-scam.net",
        detected_at: new Date(Date.now() - 3600000).toISOString(),
        action: "quarantined",
      },
      {
        id: "3",
        type: "phishing",
        severity: "high",
        subject: "Invoice #INV-2024-001 requires immediate payment",
        sender_email: "accounting@company-invoices.biz",
        detected_at: new Date(Date.now() - 7200000).toISOString(),
        action: "blocked",
      },
    ],
    top_blocked_senders: [
      {
        email: "spam@bad-domain.com",
        domain: "bad-domain.com",
        block_count: 245,
        reason: "spam",
        reputation: 0.05,
      },
      {
        email: "phish@fake-bank.net",
        domain: "fake-bank.net",
        block_count: 156,
        reason: "phishing",
        reputation: 0.02,
      },
      {
        email: "offers@promo-spam.org",
        domain: "promo-spam.org",
        block_count: 98,
        reason: "spam",
        reputation: 0.12,
      },
    ],
    trend_data: {
      labels: Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }),
      spam_counts: Array.from({ length: 30 }, () => Math.floor(Math.random() * 400) + 200),
      phish_counts: Array.from({ length: 30 }, () => Math.floor(Math.random() * 20) + 5),
      ham_counts: Array.from({ length: 30 }, () => Math.floor(Math.random() * 3000) + 2000),
    },
  };
}

export default ThreatDashboard;
