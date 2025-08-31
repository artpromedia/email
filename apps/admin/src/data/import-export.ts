import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "../hooks/useAdminToast";

// Types for Import/Export
export interface ImportUser {
  name: string;
  email: string;
  role: "admin" | "user" | "support";
  quota?: number;
  enabled?: boolean;
  group?: string;
  aliases?: string; // semicolon-separated
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
  value: any;
}

export interface ImportPreview {
  validRows: ImportUser[];
  invalidRows: ImportValidationError[];
  totalRows: number;
  summary: {
    admins: number;
    users: number;
    support: number;
    enabled: number;
    disabled: number;
  };
}

export interface ImportJobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial";
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
  };
  startedAt: string;
  completedAt?: string;
  errors?: Array<{
    row: number;
    email: string;
    error: string;
  }>;
  errorsCsvUrl?: string;
}

export interface ExportFilters {
  query?: string;
  role?: string;
  status?: string;
  enabled?: boolean;
  group?: string;
  createdAfter?: string;
  createdBefore?: string;
}

// Mock data for import jobs
const mockImportJobs: Record<string, ImportJobStatus> = {};

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// CSV validation functions
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateRole(role: string): role is "admin" | "user" | "support" {
  return ["admin", "user", "support"].includes(role);
}

function validateQuota(quota: any): number | undefined {
  if (quota === undefined || quota === null || quota === "") return undefined;
  const num = parseInt(quota.toString(), 10);
  return !isNaN(num) && num > 0 ? num : undefined;
}

function validateEnabled(enabled: any): boolean {
  if (enabled === undefined || enabled === null || enabled === "") return true;
  const str = enabled.toString().toLowerCase();
  return ["true", "1", "yes", "y", "enabled"].includes(str);
}

// Mock API functions
export const importExportAPI = {
  // Validate and preview CSV data
  async validateImport(csvData: string): Promise<ImportPreview> {
    await delay(500);

    const lines = csvData.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("CSV must contain header row and at least one data row");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const requiredHeaders = ["name", "email", "role"];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);
    }

    const validRows: ImportUser[] = [];
    const invalidRows: ImportValidationError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = i + 1; // 1-based row number
      const values = lines[i].split(",").map((v) => v.trim());
      const rowData: Record<string, string> = {};

      headers.forEach((header, index) => {
        rowData[header] = values[index] || "";
      });

      const errors: ImportValidationError[] = [];

      // Validate required fields
      if (!rowData.name) {
        errors.push({
          row,
          field: "name",
          message: "Name is required",
          value: rowData.name,
        });
      }

      if (!rowData.email) {
        errors.push({
          row,
          field: "email",
          message: "Email is required",
          value: rowData.email,
        });
      } else if (!validateEmail(rowData.email)) {
        errors.push({
          row,
          field: "email",
          message: "Invalid email format",
          value: rowData.email,
        });
      }

      if (!rowData.role) {
        errors.push({
          row,
          field: "role",
          message: "Role is required",
          value: rowData.role,
        });
      } else if (!validateRole(rowData.role)) {
        errors.push({
          row,
          field: "role",
          message: "Role must be admin, user, or support",
          value: rowData.role,
        });
      }

      // Validate optional fields
      const quota = validateQuota(rowData.quota);
      if (rowData.quota && quota === undefined) {
        errors.push({
          row,
          field: "quota",
          message: "Quota must be a positive number",
          value: rowData.quota,
        });
      }

      if (errors.length > 0) {
        invalidRows.push(...errors);
      } else {
        validRows.push({
          name: rowData.name,
          email: rowData.email,
          role: rowData.role as "admin" | "user" | "support",
          quota,
          enabled: validateEnabled(rowData.enabled),
          group: rowData.group || undefined,
          aliases: rowData.aliases || undefined,
        });
      }
    }

    const summary = validRows.reduce(
      (acc, user) => {
        acc[user.role]++;
        if (user.enabled !== false) {
          acc.enabled++;
        } else {
          acc.disabled++;
        }
        return acc;
      },
      { admins: 0, users: 0, support: 0, enabled: 0, disabled: 0 },
    );

    return {
      validRows,
      invalidRows,
      totalRows: lines.length - 1,
      summary,
    };
  },

  // Start import job
  async startImport(users: ImportUser[]): Promise<{ jobId: string }> {
    await delay(300);

    const jobId = "job_" + Math.random().toString(36).substring(2, 12);

    // Initialize job status
    mockImportJobs[jobId] = {
      id: jobId,
      status: "pending",
      progress: {
        total: users.length,
        processed: 0,
        successful: 0,
        failed: 0,
      },
      startedAt: new Date().toISOString(),
    };

    // Simulate processing in chunks
    setTimeout(() => this.simulateImportProgress(jobId, users), 1000);

    return { jobId };
  },

  // Simulate import progress
  async simulateImportProgress(jobId: string, users: ImportUser[]) {
    const job = mockImportJobs[jobId];
    if (!job) return;

    job.status = "processing";
    const chunkSize = 500;
    const chunks = [];

    for (let i = 0; i < users.length; i += chunkSize) {
      chunks.push(users.slice(i, i + chunkSize));
    }

    const errors: Array<{ row: number; email: string; error: string }> = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      await delay(1000); // Simulate processing time

      for (let i = 0; i < chunk.length; i++) {
        const user = chunk[i];
        const globalIndex = chunkIndex * chunkSize + i;

        // Simulate some failures (5% failure rate)
        if (Math.random() < 0.05) {
          errors.push({
            row: globalIndex + 2, // Account for header row
            email: user.email,
            error: "User already exists or validation failed",
          });
          job.progress.failed++;
        } else {
          job.progress.successful++;
        }

        job.progress.processed++;
      }
    }

    job.completedAt = new Date().toISOString();
    job.errors = errors;

    if (errors.length === 0) {
      job.status = "completed";
    } else if (job.progress.successful > 0) {
      job.status = "partial";
      job.errorsCsvUrl = `/admin/users/import/${jobId}/errors.csv`;
    } else {
      job.status = "failed";
    }
  },

  // Get import job status
  async getImportStatus(jobId: string): Promise<ImportJobStatus> {
    await delay(200);

    const job = mockImportJobs[jobId];
    if (!job) {
      throw new Error("Import job not found");
    }

    return job;
  },

  // Generate export URL
  getExportUrl(filters: ExportFilters = {}): string {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });

    return `/admin/users/export.csv?${params.toString()}`;
  },

  // Simulate export download (in real implementation this would be a direct download)
  async simulateExport(
    filters: ExportFilters = {},
  ): Promise<{ url: string; filename: string }> {
    await delay(800); // Simulate server processing time

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `users_export_${timestamp}.csv`;

    // In real implementation, this would return a blob URL or trigger download
    return {
      url: this.getExportUrl(filters),
      filename,
    };
  },
};

// Query Keys
export const importExportKeys = {
  all: ["importExport"] as const,
  importStatus: (jobId: string) =>
    [...importExportKeys.all, "import", jobId] as const,
};

// Query Hooks
export function useImportStatus(
  jobId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery({
    queryKey: importExportKeys.importStatus(jobId || ""),
    queryFn: () => importExportAPI.getImportStatus(jobId!),
    enabled: !!jobId && options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 2000,
    refetchIntervalInBackground: true,
  });
}

// Mutation Hooks
export function useValidateImport() {
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (csvData: string) => importExportAPI.validateImport(csvData),
    onError: (error: Error) => {
      toast.error(`Import validation failed: ${error.message}`);
    },
  });
}

export function useStartImport() {
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (users: ImportUser[]) => importExportAPI.startImport(users),
    onSuccess: () => {
      toast.success("Import job started successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to start import: ${error.message}`);
    },
  });
}

export function useExportUsers() {
  const toast = useAdminToast();

  return useMutation({
    mutationFn: (filters: ExportFilters) =>
      importExportAPI.simulateExport(filters),
    onSuccess: (data) => {
      toast.success(`Export ready: ${data.filename}`);

      // In real implementation, this would trigger the download
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    onError: (error: Error) => {
      toast.error(`Export failed: ${error.message}`);
    },
  });
}
