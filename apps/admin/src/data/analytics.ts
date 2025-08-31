// Analytics Dashboard Types
export interface AnalyticsData {
  overview: SystemOverview;
  messageMetrics: MessageMetrics;
  userMetrics: UserMetrics;
  securityMetrics: SecurityMetrics;
  storageMetrics: StorageMetrics;
  performanceMetrics: PerformanceMetrics;
  trends: TrendData;
  alerts: SystemAlert[];
}

export interface SystemOverview {
  totalUsers: number;
  activeUsers: number;
  totalDomains: number;
  activeDomains: number;
  messagesPerDay: number;
  storageUsed: number;
  systemUptime: number;
  lastUpdate: Date;
}

export interface MessageMetrics {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  blockedMessages: number;
  quarantinedMessages: number;
  bounceRate: number;
  deliveryRate: number;
  spamRate: number;
  hourlyDistribution: HourlyData[];
  dailyTrend: DailyData[];
  topSenders: TopSender[];
  topRecipients: TopRecipient[];
}

export interface UserMetrics {
  newUsersToday: number;
  activeUsersToday: number;
  userGrowthRate: number;
  topActiveUsers: TopActiveUser[];
  userDistributionByDomain: DomainUserDistribution[];
  loginActivity: LoginActivity[];
}

export interface SecurityMetrics {
  threatsStopped: number;
  virusDetected: number;
  phishingBlocked: number;
  malwareBlocked: number;
  securityScore: number;
  authenticationFailures: number;
  suspiciousActivity: SuspiciousActivity[];
  securityTrends: SecurityTrend[];
}

export interface StorageMetrics {
  totalStorage: number;
  usedStorage: number;
  availableStorage: number;
  storageGrowthRate: number;
  topStorageUsers: TopStorageUser[];
  storageByDomain: DomainStorageDistribution[];
  backupStatus: BackupStatus;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  serverLoad: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkThroughput: number;
  errorRate: number;
  performanceTrends: PerformanceTrend[];
}

export interface TrendData {
  messageTrends: TrendPoint[];
  userTrends: TrendPoint[];
  securityTrends: TrendPoint[];
  storageTrends: TrendPoint[];
  performanceTrends: TrendPoint[];
}

export interface SystemAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  status: AlertStatus;
  source: string;
}

export type AlertType = "security" | "performance" | "storage" | "system" | "maintenance";
export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "active" | "acknowledged" | "resolved";

// Supporting Interfaces
export interface HourlyData {
  hour: number;
  messages: number;
  sent: number;
  received: number;
  blocked: number;
}

export interface DailyData {
  date: string;
  messages: number;
  users: number;
  threats: number;
  storage: number;
}

export interface TopSender {
  email: string;
  domain: string;
  messageCount: number;
  reputation: number;
}

export interface TopRecipient {
  email: string;
  domain: string;
  messageCount: number;
  storageUsed: number;
}

export interface TopActiveUser {
  email: string;
  domain: string;
  loginCount: number;
  messagesSent: number;
  messagesReceived: number;
  lastActivity: Date;
}

export interface DomainUserDistribution {
  domain: string;
  userCount: number;
  activeUsers: number;
  percentage: number;
}

export interface LoginActivity {
  hour: number;
  loginCount: number;
  uniqueUsers: number;
}

export interface SuspiciousActivity {
  id: string;
  type: string;
  description: string;
  severity: AlertSeverity;
  timestamp: Date;
  source: string;
  details: Record<string, any>;
}

export interface SecurityTrend {
  date: string;
  threats: number;
  blocked: number;
  quarantined: number;
  score: number;
}

export interface TopStorageUser {
  email: string;
  domain: string;
  storageUsed: number;
  quota: number;
  utilizationRate: number;
}

export interface DomainStorageDistribution {
  domain: string;
  storageUsed: number;
  userCount: number;
  averagePerUser: number;
}

export interface BackupStatus {
  lastBackup: Date;
  nextBackup: Date;
  backupSize: number;
  status: "success" | "failed" | "in_progress";
  retentionDays: number;
}

export interface PerformanceTrend {
  timestamp: Date;
  responseTime: number;
  load: number;
  memory: number;
  cpu: number;
}

export interface TrendPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface AnalyticsFilters {
  timeRange: TimeRange;
  domain?: string;
  metric?: string;
}

export type TimeRange = "1h" | "24h" | "7d" | "30d" | "90d" | "1y";

// Mock Data
const generateHourlyData = (): HourlyData[] => {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    messages: Math.floor(Math.random() * 500) + 100,
    sent: Math.floor(Math.random() * 250) + 50,
    received: Math.floor(Math.random() * 250) + 50,
    blocked: Math.floor(Math.random() * 50) + 5,
  }));
};

const generateDailyData = (): DailyData[] => {
  const data: DailyData[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      messages: Math.floor(Math.random() * 10000) + 5000,
      users: Math.floor(Math.random() * 100) + 50,
      threats: Math.floor(Math.random() * 50) + 10,
      storage: Math.floor(Math.random() * 5) + 40,
    });
  }
  return data;
};

const mockAnalyticsData: AnalyticsData = {
  overview: {
    totalUsers: 1285,
    activeUsers: 1180,
    totalDomains: 4,
    activeDomains: 3,
    messagesPerDay: 9425,
    storageUsed: 47.2,
    systemUptime: 99.8,
    lastUpdate: new Date(),
  },
  messageMetrics: {
    totalMessages: 47250,
    sentMessages: 23625,
    receivedMessages: 23625,
    blockedMessages: 1890,
    quarantinedMessages: 945,
    bounceRate: 2.1,
    deliveryRate: 97.9,
    spamRate: 4.2,
    hourlyDistribution: generateHourlyData(),
    dailyTrend: generateDailyData(),
    topSenders: [
      { email: "newsletter@ceerion.com", domain: "ceerion.com", messageCount: 1250, reputation: 95 },
      { email: "support@ceerion.com", domain: "ceerion.com", messageCount: 890, reputation: 98 },
      { email: "alerts@ceerion.com", domain: "ceerion.com", messageCount: 567, reputation: 92 },
      { email: "marketing@ceerion.com", domain: "ceerion.com", messageCount: 445, reputation: 89 },
      { email: "noreply@ceerion.com", domain: "ceerion.com", messageCount: 334, reputation: 96 },
    ],
    topRecipients: [
      { email: "admin@ceerion.com", domain: "ceerion.com", messageCount: 2340, storageUsed: 8.5 },
      { email: "support@ceerion.com", domain: "ceerion.com", messageCount: 1890, storageUsed: 6.2 },
      { email: "security@ceerion.com", domain: "ceerion.com", messageCount: 1456, storageUsed: 4.8 },
      { email: "operations@ceerion.com", domain: "ceerion.com", messageCount: 1123, storageUsed: 3.9 },
      { email: "alerts@ceerion.com", domain: "ceerion.com", messageCount: 998, storageUsed: 2.1 },
    ],
  },
  userMetrics: {
    newUsersToday: 12,
    activeUsersToday: 1180,
    userGrowthRate: 8.5,
    topActiveUsers: [
      { email: "admin@ceerion.com", domain: "ceerion.com", loginCount: 45, messagesSent: 234, messagesReceived: 567, lastActivity: new Date() },
      { email: "support@ceerion.com", domain: "ceerion.com", loginCount: 38, messagesSent: 189, messagesReceived: 445, lastActivity: new Date() },
      { email: "security@ceerion.com", domain: "ceerion.com", loginCount: 32, messagesSent: 145, messagesReceived: 334, lastActivity: new Date() },
      { email: "operations@ceerion.com", domain: "ceerion.com", loginCount: 28, messagesSent: 123, messagesReceived: 289, lastActivity: new Date() },
      { email: "dev@ceerion.com", domain: "ceerion.com", loginCount: 25, messagesSent: 98, messagesReceived: 234, lastActivity: new Date() },
    ],
    userDistributionByDomain: [
      { domain: "ceerion.com", userCount: 1250, activeUsers: 1150, percentage: 97.2 },
      { domain: "support.ceerion.com", userCount: 25, activeUsers: 23, percentage: 1.9 },
      { domain: "demo.ceerion.com", userCount: 10, activeUsers: 7, percentage: 0.8 },
      { domain: "marketing.ceerion.com", userCount: 0, activeUsers: 0, percentage: 0.1 },
    ],
    loginActivity: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      loginCount: Math.floor(Math.random() * 100) + 20,
      uniqueUsers: Math.floor(Math.random() * 80) + 15,
    })),
  },
  securityMetrics: {
    threatsStopped: 1245,
    virusDetected: 89,
    phishingBlocked: 234,
    malwareBlocked: 167,
    securityScore: 94,
    authenticationFailures: 23,
    suspiciousActivity: [
      {
        id: "sus-001",
        type: "Brute Force",
        description: "Multiple failed login attempts from IP 192.168.1.100",
        severity: "warning",
        timestamp: new Date(),
        source: "Auth System",
        details: { ip: "192.168.1.100", attempts: 15 }
      },
      {
        id: "sus-002",
        type: "Suspicious Email",
        description: "Email with suspicious attachment detected",
        severity: "critical",
        timestamp: new Date(),
        source: "Mail Filter",
        details: { sender: "unknown@suspicious.com", attachment: "invoice.exe" }
      },
    ],
    securityTrends: generateDailyData().map(d => ({
      date: d.date,
      threats: d.threats,
      blocked: Math.floor(d.threats * 0.8),
      quarantined: Math.floor(d.threats * 0.2),
      score: Math.floor(Math.random() * 10) + 90,
    })),
  },
  storageMetrics: {
    totalStorage: 100,
    usedStorage: 47.2,
    availableStorage: 52.8,
    storageGrowthRate: 12.5,
    topStorageUsers: [
      { email: "archive@ceerion.com", domain: "ceerion.com", storageUsed: 8.5, quota: 10, utilizationRate: 85 },
      { email: "marketing@ceerion.com", domain: "ceerion.com", storageUsed: 6.2, quota: 8, utilizationRate: 77.5 },
      { email: "support@ceerion.com", domain: "ceerion.com", storageUsed: 4.8, quota: 6, utilizationRate: 80 },
      { email: "admin@ceerion.com", domain: "ceerion.com", storageUsed: 3.9, quota: 5, utilizationRate: 78 },
      { email: "backup@ceerion.com", domain: "ceerion.com", storageUsed: 3.2, quota: 4, utilizationRate: 80 },
    ],
    storageByDomain: [
      { domain: "ceerion.com", storageUsed: 45.7, userCount: 1250, averagePerUser: 0.037 },
      { domain: "support.ceerion.com", storageUsed: 1.2, userCount: 25, averagePerUser: 0.048 },
      { domain: "demo.ceerion.com", storageUsed: 0.3, userCount: 10, averagePerUser: 0.03 },
      { domain: "marketing.ceerion.com", storageUsed: 0, userCount: 0, averagePerUser: 0 },
    ],
    backupStatus: {
      lastBackup: new Date(Date.now() - 4 * 60 * 60 * 1000),
      nextBackup: new Date(Date.now() + 20 * 60 * 60 * 1000),
      backupSize: 47.2,
      status: "success",
      retentionDays: 30,
    },
  },
  performanceMetrics: {
    averageResponseTime: 125,
    serverLoad: 68,
    memoryUsage: 74,
    cpuUsage: 45,
    diskUsage: 47,
    networkThroughput: 1250,
    errorRate: 0.12,
    performanceTrends: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000),
      responseTime: Math.floor(Math.random() * 50) + 100,
      load: Math.floor(Math.random() * 30) + 50,
      memory: Math.floor(Math.random() * 20) + 60,
      cpu: Math.floor(Math.random() * 40) + 30,
    })),
  },
  trends: {
    messageTrends: generateDailyData().map(d => ({ timestamp: new Date(d.date), value: d.messages })),
    userTrends: generateDailyData().map(d => ({ timestamp: new Date(d.date), value: d.users })),
    securityTrends: generateDailyData().map(d => ({ timestamp: new Date(d.date), value: d.threats })),
    storageTrends: generateDailyData().map(d => ({ timestamp: new Date(d.date), value: d.storage })),
    performanceTrends: generateDailyData().map(d => ({ timestamp: new Date(d.date), value: Math.floor(Math.random() * 50) + 100 })),
  },
  alerts: [
    {
      id: "alert-001",
      type: "storage",
      severity: "warning",
      title: "Storage Usage High",
      message: "Storage usage has reached 75% of total capacity",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: "active",
      source: "Storage Monitor",
    },
    {
      id: "alert-002",
      type: "security",
      severity: "critical",
      title: "Multiple Authentication Failures",
      message: "Detected 15 failed login attempts from suspicious IP",
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      status: "acknowledged",
      source: "Security Monitor",
    },
    {
      id: "alert-003",
      type: "performance",
      severity: "info",
      title: "Server Load Normal",
      message: "Server load has returned to normal levels",
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      status: "resolved",
      source: "Performance Monitor",
    },
  ],
};

// API Functions
export const getAnalyticsData = async (filters: AnalyticsFilters = { timeRange: "24h" }): Promise<AnalyticsData> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Simulate filtering based on time range
  console.log("Filtering analytics data with:", filters);
  return mockAnalyticsData;
};

export const getSystemOverview = async (): Promise<SystemOverview> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return mockAnalyticsData.overview;
};

export const acknowledgeAlert = async (alertId: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log("Acknowledging alert:", alertId);
  // In real implementation, would update alert status in database
};

export const resolveAlert = async (alertId: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log("Resolving alert:", alertId);
  // In real implementation, would update alert status in database
};
