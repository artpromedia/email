// Audit Log Types
export interface AuditLog {
  id: string;
  timestamp: Date;
  adminId: string;
  adminEmail: string;
  adminName: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  details: string;
  metadata: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  severity: AuditSeverity;
  outcome: AuditOutcome;
}

export type AuditAction =
  | "user_created"
  | "user_updated"
  | "user_deleted"
  | "user_suspended"
  | "user_activated"
  | "message_released"
  | "message_deleted"
  | "message_quarantined"
  | "domain_whitelisted"
  | "domain_blacklisted"
  | "domain_removed"
  | "policy_created"
  | "policy_updated"
  | "policy_deleted"
  | "login_success"
  | "login_failed"
  | "logout"
  | "password_changed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "settings_updated"
  | "backup_created"
  | "backup_restored"
  | "admin_created"
  | "admin_deleted"
  | "permissions_changed";

export type AuditResource =
  | "user"
  | "message"
  | "domain"
  | "policy"
  | "admin"
  | "system"
  | "auth"
  | "settings";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

export type AuditOutcome = "success" | "failure" | "warning";

export interface AuditFilters {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AuditStats {
  totalLogs: number;
  todayLogs: number;
  criticalEvents: number;
  failedActions: number;
  topAdmins: Array<{
    adminId: string;
    adminName: string;
    actionCount: number;
  }>;
  actionBreakdown: Record<AuditAction, number>;
}

// Mock Data
const mockAuditLogs: AuditLog[] = [
  {
    id: "audit-001",
    timestamp: new Date("2025-08-31T10:30:00Z"),
    adminId: "admin-001",
    adminEmail: "admin@ceerion.com",
    adminName: "System Administrator",
    action: "message_released",
    resource: "message",
    resourceId: "quar-001",
    details: "Released quarantined message from suspicious@malware-site.com",
    metadata: {
      messageSubject: "Urgent: Your account has been compromised!",
      quarantineReason: "malware",
      recipientEmail: "user1@ceerion.com",
    },
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "medium",
    outcome: "success",
  },
  {
    id: "audit-002",
    timestamp: new Date("2025-08-31T10:25:00Z"),
    adminId: "admin-001",
    adminEmail: "admin@ceerion.com",
    adminName: "System Administrator",
    action: "user_created",
    resource: "user",
    resourceId: "user-456",
    details: "Created new user account",
    metadata: {
      userEmail: "newuser@ceerion.com",
      userRole: "standard",
      department: "Marketing",
    },
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "low",
    outcome: "success",
  },
  {
    id: "audit-003",
    timestamp: new Date("2025-08-31T09:45:00Z"),
    adminId: "admin-002",
    adminEmail: "security@ceerion.com",
    adminName: "Security Admin",
    action: "login_failed",
    resource: "auth",
    details: "Failed login attempt - invalid password",
    metadata: {
      attemptedEmail: "admin@ceerion.com",
      failureReason: "invalid_password",
      consecutiveFailures: 3,
    },
    ipAddress: "203.0.113.45",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    severity: "high",
    outcome: "failure",
  },
  {
    id: "audit-004",
    timestamp: new Date("2025-08-31T09:30:00Z"),
    adminId: "admin-001",
    adminEmail: "admin@ceerion.com",
    adminName: "System Administrator",
    action: "domain_blacklisted",
    resource: "domain",
    resourceId: "malware-site.com",
    details: "Added domain to blacklist due to malware distribution",
    metadata: {
      domain: "malware-site.com",
      reason: "malware_distribution",
      threatLevel: "high",
      affectedMessages: 15,
    },
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "high",
    outcome: "success",
  },
  {
    id: "audit-005",
    timestamp: new Date("2025-08-31T09:15:00Z"),
    adminId: "admin-003",
    adminEmail: "support@ceerion.com",
    adminName: "Support Admin",
    action: "user_suspended",
    resource: "user",
    resourceId: "user-789",
    details: "Suspended user account due to policy violation",
    metadata: {
      userEmail: "violator@ceerion.com",
      suspensionReason: "policy_violation",
      duration: "7_days",
      violationType: "spam_sending",
    },
    ipAddress: "192.168.1.105",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "medium",
    outcome: "success",
  },
  {
    id: "audit-006",
    timestamp: new Date("2025-08-31T08:30:00Z"),
    adminId: "admin-001",
    adminEmail: "admin@ceerion.com",
    adminName: "System Administrator",
    action: "settings_updated",
    resource: "system",
    details: "Updated quarantine threshold settings",
    metadata: {
      settingGroup: "quarantine",
      changes: {
        spamThreshold: { from: 5, to: 7 },
        virusAction: { from: "quarantine", to: "block" },
      },
    },
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "medium",
    outcome: "success",
  },
];

const mockAuditStats: AuditStats = {
  totalLogs: 1247,
  todayLogs: 23,
  criticalEvents: 3,
  failedActions: 8,
  topAdmins: [
    {
      adminId: "admin-001",
      adminName: "System Administrator",
      actionCount: 156,
    },
    { adminId: "admin-002", adminName: "Security Admin", actionCount: 89 },
    { adminId: "admin-003", adminName: "Support Admin", actionCount: 67 },
  ],
  actionBreakdown: {
    user_created: 45,
    user_updated: 78,
    user_deleted: 12,
    user_suspended: 8,
    user_activated: 15,
    message_released: 234,
    message_deleted: 67,
    message_quarantined: 445,
    domain_whitelisted: 23,
    domain_blacklisted: 15,
    domain_removed: 5,
    policy_created: 12,
    policy_updated: 34,
    policy_deleted: 3,
    login_success: 1245,
    login_failed: 56,
    logout: 1198,
    password_changed: 23,
    mfa_enabled: 67,
    mfa_disabled: 12,
    settings_updated: 89,
    backup_created: 12,
    backup_restored: 2,
    admin_created: 5,
    admin_deleted: 1,
    permissions_changed: 23,
  },
};

// API Functions
export const getAuditLogs = async (
  filters: AuditFilters = {},
): Promise<AuditLog[]> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  let filteredLogs = [...mockAuditLogs];

  // Apply filters
  if (filters.startDate) {
    const startDate = new Date(filters.startDate);
    filteredLogs = filteredLogs.filter((log) => log.timestamp >= startDate);
  }

  if (filters.endDate) {
    const endDate = new Date(filters.endDate);
    filteredLogs = filteredLogs.filter((log) => log.timestamp <= endDate);
  }

  if (filters.adminId) {
    filteredLogs = filteredLogs.filter(
      (log) => log.adminId === filters.adminId,
    );
  }

  if (filters.action) {
    filteredLogs = filteredLogs.filter((log) => log.action === filters.action);
  }

  if (filters.resource) {
    filteredLogs = filteredLogs.filter(
      (log) => log.resource === filters.resource,
    );
  }

  if (filters.severity) {
    filteredLogs = filteredLogs.filter(
      (log) => log.severity === filters.severity,
    );
  }

  if (filters.outcome) {
    filteredLogs = filteredLogs.filter(
      (log) => log.outcome === filters.outcome,
    );
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredLogs = filteredLogs.filter(
      (log) =>
        log.details.toLowerCase().includes(searchLower) ||
        log.adminEmail.toLowerCase().includes(searchLower) ||
        log.adminName.toLowerCase().includes(searchLower),
    );
  }

  // Sort by timestamp (newest first)
  filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return filteredLogs.slice(startIndex, endIndex);
};

export const getAuditStats = async (): Promise<AuditStats> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockAuditStats;
};

export const exportAuditLogs = async (
  filters: AuditFilters = {},
): Promise<Blob> => {
  const logs = await getAuditLogs(filters);

  // Create CSV content
  const headers = [
    "Timestamp",
    "Admin",
    "Action",
    "Resource",
    "Details",
    "Severity",
    "Outcome",
    "IP Address",
  ];

  const rows = logs.map((log) => [
    log.timestamp.toISOString(),
    `${log.adminName} (${log.adminEmail})`,
    log.action,
    log.resource,
    log.details,
    log.severity,
    log.outcome,
    log.ipAddress,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
};
