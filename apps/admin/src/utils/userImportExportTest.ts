// Test utilities for import/export functionality
import { exportToCSV, exportToJSON, exportToExcelCSV } from "./userExport";

// Sample test data
const sampleUsers = [
  {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@test.com",
    role: "admin",
    status: "active",
    enabled: true,
    mfaEnabled: true,
    quotaUsed: 2.5,
    quotaLimit: 10,
    lastLogin: "2024-01-15T10:30:00Z",
    createdAt: "2023-06-01T09:00:00Z",
  },
  {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@test.com",
    role: "user",
    status: "active",
    enabled: true,
    mfaEnabled: false,
    quotaUsed: 1.2,
    quotaLimit: 5,
    lastLogin: "2024-01-14T16:45:00Z",
    createdAt: "2023-08-15T11:30:00Z",
  },
];

// Test functions (for development/debugging)
export function testCSVExport() {
  console.log("Testing CSV export...");
  exportToCSV(sampleUsers, "test-users.csv");
}

export function testJSONExport() {
  console.log("Testing JSON export...");
  exportToJSON(sampleUsers, "test-users.json");
}

export function testExcelExport() {
  console.log("Testing Excel CSV export...");
  exportToExcelCSV(sampleUsers, "test-users-excel.csv");
}

// Validation functions
export function validateImportData(users: any[]): {
  valid: any[];
  errors: string[];
} {
  const valid: any[] = [];
  const errors: string[] = [];

  users.forEach((user, index) => {
    const rowNum = index + 1;

    // Required field validation
    if (!user.firstName?.trim()) {
      errors.push(`Row ${rowNum}: First Name is required`);
      return;
    }

    if (!user.lastName?.trim()) {
      errors.push(`Row ${rowNum}: Last Name is required`);
      return;
    }

    if (!user.email?.trim()) {
      errors.push(`Row ${rowNum}: Email is required`);
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email)) {
      errors.push(`Row ${rowNum}: Invalid email format`);
      return;
    }

    // Role validation
    const validRoles = ["admin", "user", "support"];
    if (user.role && !validRoles.includes(user.role.toLowerCase())) {
      errors.push(
        `Row ${rowNum}: Invalid role. Must be one of: ${validRoles.join(", ")}`,
      );
      return;
    }

    // Status validation
    const validStatuses = ["active", "suspended", "pending"];
    if (user.status && !validStatuses.includes(user.status.toLowerCase())) {
      errors.push(
        `Row ${rowNum}: Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      );
      return;
    }

    // Quota validation
    if (user.quotaLimit && (isNaN(user.quotaLimit) || user.quotaLimit < 1)) {
      errors.push(`Row ${rowNum}: Quota limit must be a positive number`);
      return;
    }

    // If all validations pass, add to valid array
    valid.push({
      ...user,
      role: user.role?.toLowerCase() || "user",
      status: user.status?.toLowerCase() || "active",
      enabled: user.enabled === true || user.enabled === "true",
      mfaEnabled: user.mfaEnabled === true || user.mfaEnabled === "true",
      quotaLimit: parseInt(user.quotaLimit) || 5,
    });
  });

  return { valid, errors };
}

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Helper function to detect file type
export function getFileType(
  filename: string,
): "csv" | "json" | "excel" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "xlsx":
    case "xls":
      return "excel";
    default:
      return "unknown";
  }
}

// Console helpers for development
if (typeof window !== "undefined") {
  // Make test functions available in browser console
  (window as any).testUserImportExport = {
    testCSVExport,
    testJSONExport,
    testExcelExport,
    validateImportData,
    sampleUsers,
  };
}
