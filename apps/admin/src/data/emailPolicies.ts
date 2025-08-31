// Email Filtering Policy Types
export interface EmailPolicy {
  id: string;
  name: string;
  description: string;
  type: EmailPolicyType;
  category: PolicyCategory;
  status: PolicyStatus;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
  isSystemPolicy: boolean;
  appliedCount: number;
}

export type EmailPolicyType = 
  | "content_filter" | "spam_filter" | "virus_filter" | "attachment_filter"
  | "sender_filter" | "recipient_filter" | "domain_filter" 
  | "quarantine_rule" | "delivery_rule" | "retention_rule";

export type PolicyCategory = 
  | "security" | "compliance" | "content" | "routing" | "storage";

export type PolicyStatus = "active" | "inactive" | "draft" | "archived";

export interface PolicyCondition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string | string[] | number;
  caseSensitive?: boolean;
}

export type ConditionField = 
  | "sender_email" | "sender_domain" | "recipient_email" | "recipient_domain"
  | "subject" | "body" | "attachment_name" | "attachment_type" | "message_size"
  | "spam_score" | "virus_scan_result" | "sender_reputation";

export type ConditionOperator = 
  | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" 
  | "ends_with" | "regex" | "greater_than" | "less_than" | "in_list" | "not_in_list";

export interface PolicyAction {
  id: string;
  type: ActionType;
  parameters: Record<string, any>;
  order: number;
}

export type ActionType = 
  | "quarantine" | "block" | "allow" | "tag" | "forward" | "encrypt"
  | "add_header" | "remove_header" | "modify_subject" | "notify_admin"
  | "log_event" | "delay_delivery" | "require_approval";

export interface EmailPolicyFilters {
  type?: EmailPolicyType;
  category?: PolicyCategory;
  status?: PolicyStatus;
  search?: string;
  createdBy?: string;
  page?: number;
  limit?: number;
}

export interface EmailPolicyStats {
  totalPolicies: number;
  activePolicies: number;
  draftPolicies: number;
  recentlyModified: number;
  topCategories: Array<{
    category: PolicyCategory;
    count: number;
  }>;
  applicationStats: Array<{
    policyId: string;
    policyName: string;
    appliedCount: number;
  }>;
}

// Mock Data
const mockEmailPolicies: EmailPolicy[] = [
  {
    id: "policy-001",
    name: "Block Known Malware Domains",
    description: "Automatically block emails from domains known to distribute malware",
    type: "domain_filter",
    category: "security",
    status: "active",
    priority: 1,
    conditions: [
      {
        id: "cond-001",
        field: "sender_domain",
        operator: "in_list",
        value: ["malware-site.com", "virus-distributor.net", "phishing-domain.org"]
      },
      {
        id: "cond-002",
        field: "virus_scan_result",
        operator: "not_equals",
        value: "clean"
      }
    ],
    actions: [
      {
        id: "act-001",
        type: "block",
        parameters: { reason: "malware_domain" },
        order: 1
      },
      {
        id: "act-002",
        type: "notify_admin",
        parameters: { 
          recipients: ["security@ceerion.com"],
          template: "malware_blocked"
        },
        order: 2
      }
    ],
    metadata: {
      threatLevel: "high",
      autoUpdate: true,
      sourceList: "security_vendor_feed"
    },
    createdAt: new Date("2025-08-01T09:00:00Z"),
    updatedAt: new Date("2025-08-30T14:30:00Z"),
    createdBy: "security@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isSystemPolicy: true,
    appliedCount: 45
  },
  {
    id: "policy-002",
    name: "Quarantine High Spam Score",
    description: "Quarantine emails with spam score above 8.0 for manual review",
    type: "spam_filter",
    category: "security",
    status: "active",
    priority: 2,
    conditions: [
      {
        id: "cond-003",
        field: "spam_score",
        operator: "greater_than",
        value: 8.0
      }
    ],
    actions: [
      {
        id: "act-003",
        type: "quarantine",
        parameters: { 
          reason: "high_spam_score",
          retention_days: 30
        },
        order: 1
      },
      {
        id: "act-004",
        type: "tag",
        parameters: { 
          tag: "QUARANTINE_SPAM",
          color: "red"
        },
        order: 2
      }
    ],
    metadata: {
      threshold: 8.0,
      reviewRequired: true
    },
    createdAt: new Date("2025-07-15T10:00:00Z"),
    updatedAt: new Date("2025-08-25T16:15:00Z"),
    createdBy: "admin@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isSystemPolicy: false,
    appliedCount: 234
  },
  {
    id: "policy-003",
    name: "Executive Email Protection",
    description: "Enhanced protection for executive email addresses",
    type: "recipient_filter",
    category: "security",
    status: "active",
    priority: 1,
    conditions: [
      {
        id: "cond-004",
        field: "recipient_email",
        operator: "in_list",
        value: ["ceo@ceerion.com", "cto@ceerion.com", "cfo@ceerion.com"]
      },
      {
        id: "cond-005",
        field: "sender_domain",
        operator: "not_contains",
        value: "ceerion.com"
      }
    ],
    actions: [
      {
        id: "act-005",
        type: "require_approval",
        parameters: { 
          approvers: ["security@ceerion.com"],
          timeout_hours: 2
        },
        order: 1
      },
      {
        id: "act-006",
        type: "add_header",
        parameters: { 
          header: "X-Executive-Protection",
          value: "external-sender-review"
        },
        order: 2
      }
    ],
    metadata: {
      vipProtection: true,
      escalationLevel: "high"
    },
    createdAt: new Date("2025-06-01T12:00:00Z"),
    updatedAt: new Date("2025-08-20T11:45:00Z"),
    createdBy: "security@ceerion.com",
    lastModifiedBy: "security@ceerion.com",
    isSystemPolicy: false,
    appliedCount: 67
  },
  {
    id: "policy-004",
    name: "Large Attachment Warning",
    description: "Flag emails with attachments larger than 25MB",
    type: "attachment_filter",
    category: "content",
    status: "active",
    priority: 3,
    conditions: [
      {
        id: "cond-006",
        field: "message_size",
        operator: "greater_than",
        value: 26214400 // 25MB in bytes
      }
    ],
    actions: [
      {
        id: "act-007",
        type: "tag",
        parameters: { 
          tag: "LARGE_ATTACHMENT",
          color: "orange"
        },
        order: 1
      },
      {
        id: "act-008",
        type: "modify_subject",
        parameters: { 
          prefix: "[LARGE ATTACHMENT] "
        },
        order: 2
      }
    ],
    metadata: {
      sizeThreshold: "25MB",
      action: "warning"
    },
    createdAt: new Date("2025-07-01T14:00:00Z"),
    updatedAt: new Date("2025-08-15T09:30:00Z"),
    createdBy: "admin@ceerion.com",
    lastModifiedBy: "admin@ceerion.com",
    isSystemPolicy: false,
    appliedCount: 123
  },
  {
    id: "policy-005",
    name: "Compliance Archive",
    description: "Archive all emails for compliance requirements",
    type: "retention_rule",
    category: "compliance",
    status: "active",
    priority: 5,
    conditions: [
      {
        id: "cond-007",
        field: "recipient_domain",
        operator: "equals",
        value: "ceerion.com"
      }
    ],
    actions: [
      {
        id: "act-009",
        type: "log_event",
        parameters: { 
          system: "compliance_archive",
          retention_years: 7
        },
        order: 1
      }
    ],
    metadata: {
      regulation: "SOX",
      retentionPeriod: "7_years",
      archiveLocation: "secure_storage"
    },
    createdAt: new Date("2025-05-01T08:00:00Z"),
    updatedAt: new Date("2025-08-01T13:20:00Z"),
    createdBy: "compliance@ceerion.com",
    lastModifiedBy: "compliance@ceerion.com",
    isSystemPolicy: true,
    appliedCount: 8956
  }
];

const mockEmailPolicyStats: EmailPolicyStats = {
  totalPolicies: 5,
  activePolicies: 5,
  draftPolicies: 0,
  recentlyModified: 3,
  topCategories: [
    { category: "security", count: 3 },
    { category: "content", count: 1 },
    { category: "compliance", count: 1 }
  ],
  applicationStats: [
    { policyId: "policy-005", policyName: "Compliance Archive", appliedCount: 8956 },
    { policyId: "policy-002", policyName: "Quarantine High Spam Score", appliedCount: 234 },
    { policyId: "policy-004", policyName: "Large Attachment Warning", appliedCount: 123 },
    { policyId: "policy-003", policyName: "Executive Email Protection", appliedCount: 67 },
    { policyId: "policy-001", policyName: "Block Known Malware Domains", appliedCount: 45 }
  ]
};

// API Functions
export const getEmailPolicies = async (filters: EmailPolicyFilters = {}): Promise<EmailPolicy[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  let filteredPolicies = [...mockEmailPolicies];
  
  // Apply filters
  if (filters.type) {
    filteredPolicies = filteredPolicies.filter(policy => policy.type === filters.type);
  }
  
  if (filters.category) {
    filteredPolicies = filteredPolicies.filter(policy => policy.category === filters.category);
  }
  
  if (filters.status) {
    filteredPolicies = filteredPolicies.filter(policy => policy.status === filters.status);
  }
  
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredPolicies = filteredPolicies.filter(policy => 
      policy.name.toLowerCase().includes(searchLower) ||
      policy.description.toLowerCase().includes(searchLower)
    );
  }
  
  if (filters.createdBy) {
    filteredPolicies = filteredPolicies.filter(policy => 
      policy.createdBy.toLowerCase().includes(filters.createdBy!.toLowerCase())
    );
  }
  
  // Sort by priority, then by name
  filteredPolicies.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.name.localeCompare(b.name);
  });
  
  return filteredPolicies;
};

export const getEmailPolicyStats = async (): Promise<EmailPolicyStats> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return mockEmailPolicyStats;
};

export const getEmailPolicy = async (id: string): Promise<EmailPolicy | null> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return mockEmailPolicies.find(policy => policy.id === id) || null;
};

export const toggleEmailPolicyStatus = async (id: string): Promise<EmailPolicy> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const policy = mockEmailPolicies.find(p => p.id === id);
  if (!policy) throw new Error("Policy not found");
  
  const newStatus = policy.status === "active" ? "inactive" : "active";
  
  return {
    ...policy,
    status: newStatus,
    updatedAt: new Date(),
    lastModifiedBy: "admin@ceerion.com"
  };
};

export const deleteEmailPolicy = async (id: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  // In real implementation, would delete from database
};
