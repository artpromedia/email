import { useState } from "react";
import {
  Upload,
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string;
  organization?: string;
  department?: string;
  title?: string;
  groups: string[];
  avatar?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  contactCount: number;
}

interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ContactGroup[];
  onContactsImported: (contacts: Contact[]) => void;
}

export function ImportContactsDialog({
  open,
  onOpenChange,
  groups,
  onContactsImported,
}: ImportContactsDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [mergeStrategy, setMergeStrategy] = useState<
    "skip" | "update" | "duplicate"
  >("update");
  const [defaultGroup, setDefaultGroup] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);

      // Auto-detect file type
      if (file.name.endsWith(".csv")) {
        setFileType("csv");
      } else if (file.name.endsWith(".vcf")) {
        setFileType("vcard");
      } else {
        setFileType("");
      }

      // Show preview for CSV files
      if (file.name.endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const csv = e.target?.result as string;
          const lines = csv.split("\n").slice(0, 6); // Preview first 5 rows + header
          const preview = lines.map((line) => line.split(","));
          setPreviewData(preview);
          setShowPreview(true);
        };
        reader.readAsText(file);
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !fileType) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      // Simulate import process
      const totalSteps = 100;
      const stepDuration = 30; // ms per step

      for (let i = 0; i <= totalSteps; i++) {
        setImportProgress(i);
        await new Promise((resolve) => setTimeout(resolve, stepDuration));
      }

      // Mock import result
      const mockResult: ImportResult = {
        total: 150,
        imported: 142,
        updated: 8,
        failed: 0,
        errors: [],
      };

      // Generate mock contacts
      const mockContacts: Contact[] = Array.from({ length: 10 }, (_, i) => ({
        id: `imported-${Date.now()}-${i}`,
        firstName: `Imported${i + 1}`,
        lastName: "Contact",
        displayName: `Imported${i + 1} Contact`,
        email: `imported${i + 1}@example.com`,
        phone: "+1 (555) 000-000" + (i + 1),
        organization: "Imported Company",
        department: "Department",
        title: "Position",
        groups: defaultGroup ? [defaultGroup] : [],
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      setImportResult(mockResult);
      onContactsImported(mockContacts);
    } catch (error) {
      console.error("Import failed:", error);
      setImportResult({
        total: 0,
        imported: 0,
        updated: 0,
        failed: 1,
        errors: [{ row: 1, email: "", error: "Import failed" }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileType("");
    setMergeStrategy("update");
    setDefaultGroup("");
    setIsImporting(false);
    setImportProgress(0);
    setImportResult(null);
    setShowPreview(false);
    setPreviewData([]);
    onOpenChange(false);
  };

  const downloadTemplate = (type: "csv" | "vcard") => {
    let content = "";
    let filename = "";

    if (type === "csv") {
      content =
        "First Name,Last Name,Email,Phone,Organization,Department,Title\n" +
        "John,Doe,john.doe@example.com,+1-555-123-4567,ACME Corp,Engineering,Developer\n" +
        "Jane,Smith,jane.smith@example.com,+1-555-987-6543,ACME Corp,Marketing,Manager";
      filename = "contacts-template.csv";
    } else {
      content = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
EMAIL:john.doe@example.com
TEL:+1-555-123-4567
ORG:ACME Corp
TITLE:Developer
END:VCARD

BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
N:Smith;Jane;;;
EMAIL:jane.smith@example.com
TEL:+1-555-987-6543
ORG:ACME Corp
TITLE:Manager
END:VCARD`;
      filename = "contacts-template.vcf";
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Contacts
          </DialogTitle>
          <DialogDescription>
            Import contacts from CSV or vCard files
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select File</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv,.vcf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <div className="text-sm text-gray-600">
                    Click to select a CSV or vCard file
                  </div>
                  {selectedFile && (
                    <div className="mt-2 text-sm font-medium text-green-600">
                      {selectedFile.name}
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("csv")}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                CSV Template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("vcard")}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                vCard Template
              </Button>
            </div>
          </div>

          {/* File Type Selection */}
          {selectedFile && (
            <div className="space-y-2">
              <Label>File Type</Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    CSV (Comma Separated Values)
                  </SelectItem>
                  <SelectItem value="vcard">vCard (.vcf)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* CSV Preview */}
          {showPreview && previewData.length > 0 && (
            <div className="space-y-2">
              <Label>File Preview</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {previewData[0]?.map((header: string, i: number) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left font-medium"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(1, 4).map((row, i) => (
                        <tr key={i} className="border-t">
                          {row.map((cell: string, j: number) => (
                            <td key={j} className="px-3 py-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewData.length > 4 && (
                  <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
                    ... and {previewData.length - 4} more rows
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Import Options */}
          <div className="space-y-4">
            <h4 className="font-medium">Import Options</h4>

            <div className="space-y-2">
              <Label>Merge Strategy</Label>
              <Select
                value={mergeStrategy}
                onValueChange={(value) => setMergeStrategy(value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip existing contacts</SelectItem>
                  <SelectItem value="update">
                    Update existing contacts
                  </SelectItem>
                  <SelectItem value="duplicate">Create duplicates</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500">
                {mergeStrategy === "skip" &&
                  "Existing contacts with the same email will be skipped"}
                {mergeStrategy === "update" &&
                  "Existing contacts with the same email will be updated"}
                {mergeStrategy === "duplicate" &&
                  "All contacts will be imported, even if duplicates exist"}
              </div>
            </div>

            {groups.length > 0 && (
              <div className="space-y-2">
                <Label>Default Group (Optional)</Label>
                <Select value={defaultGroup} onValueChange={setDefaultGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="No default group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No default group</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                          {group.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Importing contacts...</Label>
                <span className="text-sm text-gray-600">{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Import Complete
              </h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span>Total processed:</span>
                  <span className="font-medium">{importResult.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Imported:</span>
                  <span className="font-medium text-green-600">
                    {importResult.imported}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Updated:</span>
                  <span className="font-medium text-blue-600">
                    {importResult.updated}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <span className="font-medium text-red-600">
                    {importResult.failed}
                  </span>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Import Errors:</div>
                      {importResult.errors.slice(0, 3).map((error, i) => (
                        <div key={i} className="text-xs">
                          Row {error.row}: {error.error}
                        </div>
                      ))}
                      {importResult.errors.length > 3 && (
                        <div className="text-xs">
                          ... and {importResult.errors.length - 3} more errors
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={!selectedFile || !fileType || isImporting}
            >
              {isImporting ? "Importing..." : "Import Contacts"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
