// Domain Management Types
export interface Domain {
  id: string;
  name: string;
  status: DomainStatus;
  type: DomainType;
  verification: DomainVerification;
  dnsRecords: DnsRecord[];
  mailSettings: MailSettings;
  security: SecuritySettings;
  statistics: DomainStatistics;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
  isDefault: boolean;
  aliases: string[];
}

export type DomainStatus =
  | "active"
  | "pending"
  | "suspended"
  | "failed"
  | "configuring";
export type DomainType = "primary" | "alias" | "subdomain" | "external";
export type VerificationStatus =
  | "verified"
  | "pending"
  | "failed"
  | "not_started";

export interface DomainVerification {
  status: VerificationStatus;
  method: "dns" | "email" | "file";
  token: string;
  verifiedAt?: Date;
  lastChecked: Date;
  errors: string[];
}

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  status: "active" | "pending" | "error";
  description: string;
  required: boolean;
}

export type DnsRecordType =
  | "MX"
  | "TXT"
  | "CNAME"
  | "A"
  | "AAAA"
  | "SPF"
  | "DKIM"
  | "DMARC";

export interface MailSettings {
  maxMessageSize: number; // in MB
  retentionDays: number;
  quotaPerUser: number; // in GB
  allowExternalForwarding: boolean;
  requireTls: boolean;
  enableSpamFilter: boolean;
  customBounceMessage?: string;
}

export interface SecuritySettings {
  spfPolicy: "none" | "soft_fail" | "fail";
  dkimEnabled: boolean;
  dmarcPolicy: "none" | "quarantine" | "reject";
  mtaStsEnabled: boolean;
  tlsReportingEnabled: boolean;
  requireSecureAuth: boolean;
  allowedIpRanges: string[];
}

export interface DomainStatistics {
  totalUsers: number;
  activeUsers: number;
  messagesPerDay: number;
  storageUsed: number; // in GB
  lastActivity: Date;
  bounceRate: number; // percentage
  spamRate: number; // percentage
}

export interface DomainFilters {
  status?: DomainStatus;
  type?: DomainType;
  verification?: VerificationStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DomainStats {
  totalDomains: number;
  activeDomains: number;
  pendingVerification: number;
  totalUsers: number;
  dailyMessages: number;
  storageUsed: number;
  topDomains: Array<{
    domain: string;
    users: number;
    messages: number;
  }>;
}

// Mock Data
const mockDomains: Domain[] = [
  {
    id: "domain-001",
    name: "ceerion.com",
    status: "active",
    type: "primary",
    verification: {
      status: "verified",
      method: "dns",
      token: "ceerion-verify-abc123",
      verifiedAt: new Date("2025-06-01T10:00:00Z"),
      lastChecked: new Date("2025-08-31T08:00:00Z"),
      errors: [],
    },
    dnsRecords: [
      {
        id: "dns-001",
        type: "MX",
        name: "ceerion.com",
        value: "10 mail.ceerion.com",
        ttl: 3600,
        priority: 10,
        status: "active",
        description: "Primary mail exchange record",
        required: true,
      },
      {
        id: "dns-002",
        type: "TXT",
        name: "ceerion.com",
        value: "v=spf1 include:_spf.ceerion.com ~all",
        ttl: 3600,
        status: "active",
        description: "SPF record for sender authentication",
        required: true,
      },
      {
        id: "dns-003",
        type: "TXT",
        name: "_dmarc.ceerion.com",
        value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com",
        ttl: 3600,
        status: "active",
        description: "DMARC policy record",
        required: true,
      },
      {
        id: "dns-004",
        type: "TXT",
        name: "default._domainkey.ceerion.com",
        value:
          "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
        ttl: 3600,
        status: "active",
        description: "DKIM public key",
        required: true,
      },
    ],
    mailSettings: {
      maxMessageSize: 25,
      retentionDays: 2555, // 7 years
      quotaPerUser: 50,
      allowExternalForwarding: true,
      requireTls: true,
      enableSpamFilter: true,
      customBounceMessage: "Message could not be delivered to this domain.",
    },
    security: {
      spfPolicy: "fail",
      dkimEnabled: true,
      dmarcPolicy: "quarantine",
      mtaStsEnabled: true,
      tlsReportingEnabled: true,
      requireSecureAuth: true,
      allowedIpRanges: ["192.168.1.0/24", "10.0.0.0/8"],
    },
    statistics: {
      totalUsers: 1250,
      activeUsers: 1180,
      messagesPerDay: 8950,
      storageUsed: 45.7,
      lastActivity: new Date("2025-08-31T09:30:00Z"),
      bounceRate: 2.1,
      spamRate: 0.8,
    },
    createdAt: new Date("2025-06-01T09:00:00Z"),
    updatedAt: new Date("2025-08-30T16:45:00Z"),
    createdBy: "admin@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isDefault: true,
    aliases: ["mail.ceerion.com", "smtp.ceerion.com"],
  },
  {
    id: "domain-002",
    name: "support.ceerion.com",
    status: "active",
    type: "subdomain",
    verification: {
      status: "verified",
      method: "dns",
      token: "support-verify-def456",
      verifiedAt: new Date("2025-07-15T14:20:00Z"),
      lastChecked: new Date("2025-08-31T08:00:00Z"),
      errors: [],
    },
    dnsRecords: [
      {
        id: "dns-005",
        type: "CNAME",
        name: "support.ceerion.com",
        value: "mail.ceerion.com",
        ttl: 3600,
        status: "active",
        description: "Alias to primary mail server",
        required: true,
      },
    ],
    mailSettings: {
      maxMessageSize: 25,
      retentionDays: 1095, // 3 years
      quotaPerUser: 10,
      allowExternalForwarding: false,
      requireTls: true,
      enableSpamFilter: true,
    },
    security: {
      spfPolicy: "fail",
      dkimEnabled: true,
      dmarcPolicy: "quarantine",
      mtaStsEnabled: true,
      tlsReportingEnabled: false,
      requireSecureAuth: true,
      allowedIpRanges: [],
    },
    statistics: {
      totalUsers: 25,
      activeUsers: 23,
      messagesPerDay: 450,
      storageUsed: 1.2,
      lastActivity: new Date("2025-08-31T07:15:00Z"),
      bounceRate: 1.5,
      spamRate: 0.3,
    },
    createdAt: new Date("2025-07-15T13:00:00Z"),
    updatedAt: new Date("2025-08-28T11:30:00Z"),
    createdBy: "admin@ceerion.com",
    lastModifiedBy: "support@ceerion.com",
    isDefault: false,
    aliases: [],
  },
  {
    id: "domain-003",
    name: "marketing.ceerion.com",
    status: "pending",
    type: "subdomain",
    verification: {
      status: "pending",
      method: "dns",
      token: "marketing-verify-ghi789",
      lastChecked: new Date("2025-08-31T08:00:00Z"),
      errors: ["DNS record not found", "TTL too low"],
    },
    dnsRecords: [
      {
        id: "dns-006",
        type: "CNAME",
        name: "marketing.ceerion.com",
        value: "mail.ceerion.com",
        ttl: 3600,
        status: "pending",
        description: "Alias to primary mail server",
        required: true,
      },
    ],
    mailSettings: {
      maxMessageSize: 25,
      retentionDays: 365,
      quotaPerUser: 5,
      allowExternalForwarding: true,
      requireTls: true,
      enableSpamFilter: true,
    },
    security: {
      spfPolicy: "soft_fail",
      dkimEnabled: false,
      dmarcPolicy: "none",
      mtaStsEnabled: false,
      tlsReportingEnabled: false,
      requireSecureAuth: true,
      allowedIpRanges: [],
    },
    statistics: {
      totalUsers: 0,
      activeUsers: 0,
      messagesPerDay: 0,
      storageUsed: 0,
      lastActivity: new Date("2025-08-25T00:00:00Z"),
      bounceRate: 0,
      spamRate: 0,
    },
    createdAt: new Date("2025-08-25T15:30:00Z"),
    updatedAt: new Date("2025-08-30T10:15:00Z"),
    createdBy: "marketing@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isDefault: false,
    aliases: [],
  },
  {
    id: "domain-004",
    name: "demo.ceerion.com",
    status: "suspended",
    type: "subdomain",
    verification: {
      status: "verified",
      method: "dns",
      token: "demo-verify-jkl012",
      verifiedAt: new Date("2025-08-01T09:00:00Z"),
      lastChecked: new Date("2025-08-31T08:00:00Z"),
      errors: [],
    },
    dnsRecords: [
      {
        id: "dns-007",
        type: "CNAME",
        name: "demo.ceerion.com",
        value: "mail.ceerion.com",
        ttl: 3600,
        status: "active",
        description: "Alias to primary mail server",
        required: true,
      },
    ],
    mailSettings: {
      maxMessageSize: 10,
      retentionDays: 30,
      quotaPerUser: 1,
      allowExternalForwarding: false,
      requireTls: true,
      enableSpamFilter: true,
    },
    security: {
      spfPolicy: "soft_fail",
      dkimEnabled: true,
      dmarcPolicy: "none",
      mtaStsEnabled: false,
      tlsReportingEnabled: false,
      requireSecureAuth: true,
      allowedIpRanges: [],
    },
    statistics: {
      totalUsers: 10,
      activeUsers: 2,
      messagesPerDay: 25,
      storageUsed: 0.1,
      lastActivity: new Date("2025-08-20T16:30:00Z"),
      bounceRate: 5.2,
      spamRate: 1.8,
    },
    createdAt: new Date("2025-08-01T08:00:00Z"),
    updatedAt: new Date("2025-08-29T14:20:00Z"),
    createdBy: "demo@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isDefault: false,
    aliases: [],
  },
];

const mockDomainStats: DomainStats = {
  totalDomains: 4,
  activeDomains: 2,
  pendingVerification: 1,
  totalUsers: 1285,
  dailyMessages: 9425,
  storageUsed: 47.0,
  topDomains: [
    { domain: "ceerion.com", users: 1250, messages: 8950 },
    { domain: "support.ceerion.com", users: 25, messages: 450 },
    { domain: "demo.ceerion.com", users: 10, messages: 25 },
  ],
};

// API Functions
export const getDomains = async (
  filters: DomainFilters = {},
): Promise<Domain[]> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  let filteredDomains = [...mockDomains];

  if (filters.status) {
    filteredDomains = filteredDomains.filter(
      (domain) => domain.status === filters.status,
    );
  }

  if (filters.type) {
    filteredDomains = filteredDomains.filter(
      (domain) => domain.type === filters.type,
    );
  }

  if (filters.verification) {
    filteredDomains = filteredDomains.filter(
      (domain) => domain.verification.status === filters.verification,
    );
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredDomains = filteredDomains.filter((domain) =>
      domain.name.toLowerCase().includes(searchLower),
    );
  }

  // Sort by default domain first, then by name
  filteredDomains.sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return filteredDomains;
};

export const getDomainStats = async (): Promise<DomainStats> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockDomainStats;
};

export const getDomain = async (id: string): Promise<Domain | null> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockDomains.find((domain) => domain.id === id) || null;
};

export const verifyDomain = async (id: string): Promise<Domain> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const domain = mockDomains.find((d) => d.id === id);
  if (!domain) throw new Error("Domain not found");

  // Simulate verification process
  return {
    ...domain,
    verification: {
      ...domain.verification,
      status: "verified",
      verifiedAt: new Date(),
      errors: [],
    },
    status: "active",
    updatedAt: new Date(),
    lastModifiedBy: "admin@ceerion.com",
  };
};

export const updateDomainStatus = async (
  id: string,
  status: DomainStatus,
): Promise<Domain> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const domain = mockDomains.find((d) => d.id === id);
  if (!domain) throw new Error("Domain not found");

  return {
    ...domain,
    status,
    updatedAt: new Date(),
    lastModifiedBy: "admin@ceerion.com",
  };
};

export const deleteDomain = async (_id: string): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  // In real implementation, would delete from database
};
