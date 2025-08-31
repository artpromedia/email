import React, { useState } from "react";
import {
  X,
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (users: any[]) => void;
}

export function ImportUsersModal({
  isOpen,
  onClose,
  onImport,
}: ImportUsersModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    setErrors([]);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let users: any[] = [];
        const validationErrors: string[] = [];

        if (selectedFile.name.endsWith(".csv")) {
          // Parse CSV
          const text = e.target?.result as string;
          const lines = text.split("\n").filter((line) => line.trim());

          if (lines.length < 2) {
            validationErrors.push(
              "File must contain at least a header row and one data row",
            );
          } else {
            users = lines.slice(1).map((line, index) => {
              const values = line
                .split(",")
                .map((v) => v.trim().replace(/^"|"$/g, ""));
              const user = {
                firstName: values[0] || "",
                lastName: values[1] || "",
                email: values[2] || "",
                role: values[3] || "user",
                status: values[4] || "active",
                enabled: values[5] === "true",
                mfaEnabled: values[6] === "true",
                quotaLimit: parseInt(values[7]) || 5,
                rowNumber: index + 2,
              };

              // Validate required fields
              if (!user.firstName)
                validationErrors.push(
                  `Row ${user.rowNumber}: First Name is required`,
                );
              if (!user.lastName)
                validationErrors.push(
                  `Row ${user.rowNumber}: Last Name is required`,
                );
              if (!user.email)
                validationErrors.push(
                  `Row ${user.rowNumber}: Email is required`,
                );
              else if (!user.email.includes("@"))
                validationErrors.push(
                  `Row ${user.rowNumber}: Invalid email format`,
                );

              return user;
            });
          }
        } else if (selectedFile.name.endsWith(".json")) {
          users = JSON.parse(e.target?.result as string);
          if (!Array.isArray(users)) {
            validationErrors.push("JSON file must contain an array of users");
          }
        } else {
          validationErrors.push(
            "Unsupported file format. Please use CSV or JSON.",
          );
        }

        setPreviewData(users.slice(0, 5)); // Show first 5 rows for preview
        setErrors(validationErrors);
      } catch (error) {
        setErrors([
          "Error parsing file. Please check the format and try again.",
        ]);
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsText(selectedFile);
  };

  const handleDownloadTemplate = () => {
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
    const sampleData = [
      "John,Doe,john.doe@company.com,user,active,true,false,5",
      "Jane,Smith,jane.smith@company.com,admin,active,true,true,10",
      "Mike,Johnson,mike.johnson@company.com,user,active,true,false,5",
    ];

    const csvContent = [headers.join(","), ...sampleData].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (previewData.length > 0 && errors.length === 0) {
      onImport(previewData);
      onClose();
      setFile(null);
      setPreviewData([]);
      setErrors([]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Import Users</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Download Template Section */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-medium text-blue-900">Need a template?</h3>
                <p className="text-sm text-blue-700">
                  Download our CSV template to get started
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* File Upload Section */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Drop your file here, or click to browse
            </h3>
            <p className="text-gray-600 mb-4">
              Supports CSV and JSON files (max 10MB)
            </p>
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              Select File
            </Button>
          </div>

          {/* File Info */}
          {file && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="h-5 w-5 text-gray-600" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-600">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          )}

          {/* Processing */}
          {isProcessing && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Processing file...</p>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h3 className="font-medium text-red-900">Validation Errors</h3>
              </div>
              <ul className="text-sm text-red-700 space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          {previewData.length > 0 && errors.length === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="font-medium text-green-900">
                  Preview (First 5 rows)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-900">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-900">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-900">
                        Role
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-900">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((user, index) => (
                      <tr key={index} className="border-t border-gray-200">
                        <td className="px-3 py-2 text-sm">
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="px-3 py-2 text-sm">{user.email}</td>
                        <td className="px-3 py-2 text-sm">{user.role}</td>
                        <td className="px-3 py-2 text-sm">{user.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {previewData.length} users ready to import
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={previewData.length === 0 || errors.length > 0}
            >
              Import {previewData.length} Users
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
