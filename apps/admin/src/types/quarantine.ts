export interface QuarantinedEmail {
  id: string;
  date: string;
  sender: string;
  subject: string;
  recipient: string;
  score: number;
  reason: "spam" | "malware" | "policy";
  size: number; // in bytes
  headers: Record<string, string>;
  rawContent: string; // EML content
  domain: string;
  selected?: boolean;
}

export interface QuarantineFilters {
  dateRange: {
    start: string | null;
    end: string | null;
  };
  reason: ("spam" | "malware" | "policy")[];
  recipient: string;
  sender: string;
  domain: string;
  scoreRange: {
    min: number;
    max: number;
  };
  page: number;
  limit: number;
}

export interface QuarantineBulkOperation {
  action: "release" | "delete" | "allowlist";
  emailIds: string[];
}

export interface QuarantineBulkResult {
  success: string[];
  failed: Array<{
    id: string;
    error: string;
  }>;
  total: number;
}

export interface QuarantineStats {
  total: number;
  spam: number;
  malware: number;
  policy: number;
  todayCount: number;
  avgScore: number;
}
