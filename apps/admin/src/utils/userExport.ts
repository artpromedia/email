// User Export Utilities
export interface ExportUser {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  enabled: boolean;
  mfaEnabled: boolean;
  quotaUsed: number;
  quotaLimit: number;
  lastLogin?: string;
  createdAt: string;
}

export function exportToCSV(users: ExportUser[], filename?: string) {
  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Role",
    "Status",
    "Enabled",
    "MFA Enabled",
    "Quota Used (GB)",
    "Quota Limit (GB)",
    "Quota Usage %",
    "Last Login",
    "Created Date",
  ];

  const rows = users.map((user) => [
    user.firstName,
    user.lastName,
    user.email,
    user.role,
    user.status,
    user.enabled ? "Yes" : "No",
    user.mfaEnabled ? "Yes" : "No",
    user.quotaUsed.toString(),
    user.quotaLimit.toString(),
    `${Math.round((user.quotaUsed / user.quotaLimit) * 100)}%`,
    user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never",
    new Date(user.createdAt).toLocaleDateString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) =>
          // Escape cells containing commas or quotes
          typeof cell === "string" && (cell.includes(",") || cell.includes('"'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell,
        )
        .join(","),
    ),
  ].join("\n");

  downloadFile(
    csvContent,
    filename || `users-export-${getDateString()}.csv`,
    "text/csv",
  );
}

export function exportToJSON(users: ExportUser[], filename?: string) {
  const jsonContent = JSON.stringify(users, null, 2);
  downloadFile(
    jsonContent,
    filename || `users-export-${getDateString()}.json`,
    "application/json",
  );
}

// Generate Excel-compatible CSV with UTF-8 BOM for proper encoding
export function exportToExcelCSV(users: ExportUser[], filename?: string) {
  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Role",
    "Status",
    "Enabled",
    "MFA Enabled",
    "Quota Used (GB)",
    "Quota Limit (GB)",
    "Quota Usage %",
    "Last Login",
    "Created Date",
  ];

  const rows = users.map((user) => [
    user.firstName,
    user.lastName,
    user.email,
    user.role,
    user.status,
    user.enabled ? "Yes" : "No",
    user.mfaEnabled ? "Yes" : "No",
    user.quotaUsed.toString(),
    user.quotaLimit.toString(),
    `${Math.round((user.quotaUsed / user.quotaLimit) * 100)}%`,
    user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never",
    new Date(user.createdAt).toLocaleDateString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) =>
          // Escape cells containing commas or quotes
          typeof cell === "string" && (cell.includes(",") || cell.includes('"'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell,
        )
        .join(","),
    ),
  ].join("\n");

  // Add UTF-8 BOM for Excel compatibility
  const BOM = "\uFEFF";
  downloadFile(
    BOM + csvContent,
    filename || `users-export-${getDateString()}.csv`,
    "text/csv; charset=utf-8",
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

// Generate sample import template
export function downloadImportTemplate(format: "csv" | "json" = "csv") {
  const sampleUsers = [
    {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@company.com",
      role: "user",
      status: "active",
      enabled: true,
      mfaEnabled: false,
      quotaLimit: 5,
    },
    {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@company.com",
      role: "admin",
      status: "active",
      enabled: true,
      mfaEnabled: true,
      quotaLimit: 10,
    },
    {
      firstName: "Bob",
      lastName: "Johnson",
      email: "bob.johnson@company.com",
      role: "user",
      status: "active",
      enabled: true,
      mfaEnabled: false,
      quotaLimit: 5,
    },
  ];

  if (format === "json") {
    exportToJSON(sampleUsers as any, "user-import-template.json");
  } else {
    const headers = [
      "First Name",
      "Last Name",
      "Email",
      "Role",
      "Status",
      "Enabled",
      "MFA Enabled",
      "Quota Limit",
    ];
    const rows = sampleUsers.map((user) => [
      user.firstName,
      user.lastName,
      user.email,
      user.role,
      user.status,
      user.enabled.toString(),
      user.mfaEnabled.toString(),
      user.quotaLimit.toString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");
    downloadFile(csvContent, "user-import-template.csv", "text/csv");
  }
}
