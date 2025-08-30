import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  Download,
  Users,
  Clock,
  XCircle,
  Eye,
  ArrowRight,
} from "lucide-react";
import {
  useValidateImport,
  useStartImport,
  useImportStatus,
  type ImportPreview,
  type ImportUser,
  type ImportValidationError,
  type ImportJobStatus,
} from "../../data/import-export";

// Form schema
const importFormSchema = z.object({
  file: z.instanceof(File).optional(),
});

type ImportFormData = z.infer<typeof importFormSchema>;

function ImportPreviewDialog({
  preview,
  onConfirm,
  isLoading,
}: {
  preview: ImportPreview;
  onConfirm: (users: ImportUser[]) => void;
  isLoading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    onConfirm(preview.validRows);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Eye className="w-4 h-4 mr-2" />
          Preview Import ({preview.validRows.length} users)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
          <DialogDescription>
            Review the users that will be imported and any validation errors.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="summary" className="h-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="valid">
              Valid Users ({preview.validRows.length})
            </TabsTrigger>
            <TabsTrigger value="errors">
              Errors ({preview.invalidRows.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {preview.summary.admins}
                  </div>
                  <div className="text-sm text-muted-foreground">Admins</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {preview.summary.users}
                  </div>
                  <div className="text-sm text-muted-foreground">Users</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {preview.summary.support}
                  </div>
                  <div className="text-sm text-muted-foreground">Support</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {preview.summary.enabled}
                  </div>
                  <div className="text-sm text-muted-foreground">Enabled</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {preview.summary.disabled}
                  </div>
                  <div className="text-sm text-muted-foreground">Disabled</div>
                </CardContent>
              </Card>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Import Ready</AlertTitle>
              <AlertDescription>
                {preview.validRows.length} users are ready to be imported.
                {preview.invalidRows.length > 0 && (
                  <>
                    {" "}
                    {preview.invalidRows.length} rows have validation errors and
                    will be skipped.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="valid" className="h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Quota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Group</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.validRows.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.quota
                        ? `${(user.quota / 1024 / 1024 / 1024).toFixed(1)}GB`
                        : "Default"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.enabled !== false ? "default" : "secondary"
                        }
                      >
                        {user.enabled !== false ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.group || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="errors" className="h-96 overflow-auto">
            {preview.invalidRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.invalidRows.map((error, index) => (
                    <TableRow key={index}>
                      <TableCell>{error.row}</TableCell>
                      <TableCell>{error.field}</TableCell>
                      <TableCell className="text-destructive">
                        {error.message}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {error.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
                <p>No validation errors found!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || preview.validRows.length === 0}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Starting Import...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4 mr-2" />
                Start Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportStatusCard({ jobId }: { jobId: string }) {
  const { data: status, isLoading } = useImportStatus(jobId, {
    refetchInterval: status?.status === "processing" ? 2000 : false,
  });

  if (isLoading || !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case "completed":
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case "failed":
        return <XCircle className="w-6 h-6 text-red-600" />;
      case "partial":
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      case "processing":
        return <LoadingSpinner size="sm" />;
      default:
        return <Clock className="w-6 h-6 text-blue-600" />;
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case "completed":
        return "Import Completed Successfully";
      case "failed":
        return "Import Failed";
      case "partial":
        return "Import Completed with Errors";
      case "processing":
        return "Import in Progress";
      default:
        return "Import Pending";
    }
  };

  const progressPercentage =
    status.progress.total > 0
      ? (status.progress.processed / status.progress.total) * 100
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <CardTitle className="text-lg">{getStatusText()}</CardTitle>
            <CardDescription>Job ID: {status.id}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>
              {status.progress.processed} / {status.progress.total}
            </span>
          </div>
          <Progress value={progressPercentage} className="w-full" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {status.progress.successful}
            </div>
            <div className="text-sm text-muted-foreground">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {status.progress.failed}
            </div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {status.progress.processed}
            </div>
            <div className="text-sm text-muted-foreground">Processed</div>
          </div>
        </div>

        {status.errors && status.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Import Errors</AlertTitle>
            <AlertDescription>
              {status.errors.length} users failed to import.
              {status.errorsCsvUrl && (
                <div className="mt-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={status.errorsCsvUrl} download>
                      <Download className="w-4 h-4 mr-2" />
                      Download Error Report
                    </a>
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground">
          <div>Started: {new Date(status.startedAt).toLocaleString()}</div>
          {status.completedAt && (
            <div>
              Completed: {new Date(status.completedAt).toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function UserImportPage() {
  const [csvData, setCsvData] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateImportMutation = useValidateImport();
  const startImportMutation = useStartImport();

  const form = useForm<ImportFormData>({
    resolver: zodResolver(importFormSchema),
  });

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        alert("Please select a CSV file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvData(content);
        setPreview(null);
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleValidate = async () => {
    if (!csvData) return;

    try {
      const result = await validateImportMutation.mutateAsync(csvData);
      setPreview(result);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleStartImport = async (users: ImportUser[]) => {
    try {
      const result = await startImportMutation.mutateAsync(users);
      setCurrentJobId(result.jobId);
      setPreview(null);
      setCsvData("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const sampleCsvContent = `name,email,role,quota,enabled,group,aliases
John Doe,john.doe@ceerion.com,admin,10737418240,true,Administrators,j.doe@ceerion.com;johndoe@ceerion.com
Jane Smith,jane.smith@ceerion.com,user,5368709120,true,Marketing,j.smith@ceerion.com
Bob Wilson,bob.wilson@ceerion.com,support,,false,IT Support,`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Import Users</h1>
        <p className="text-muted-foreground">
          Upload a CSV file to bulk import users into the system
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
          <CardDescription>
            Select a CSV file with user data. The file should include headers:
            name, email, role, quota, enabled, group, aliases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">CSV File</Label>
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {csvData && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>CSV File Loaded</AlertTitle>
              <AlertDescription>
                {csvData.split("\n").length - 1} rows detected. Click "Validate"
                to check for errors.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleValidate}
              disabled={!csvData || validateImportMutation.isPending}
            >
              {validateImportMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Validating...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Validate CSV
                </>
              )}
            </Button>

            <Button variant="outline" asChild>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsvContent)}`}
                download="sample_users.csv"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Sample
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV Format Help */}
      <Card>
        <CardHeader>
          <CardTitle>CSV Format</CardTitle>
          <CardDescription>
            Your CSV file should follow this format with the following columns:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div>
              <strong>name</strong> (required): Full name of the user
            </div>
            <div>
              <strong>email</strong> (required): Primary email address
            </div>
            <div>
              <strong>role</strong> (required): admin, user, or support
            </div>
            <div>
              <strong>quota</strong> (optional): Storage quota in bytes
              (default: 10GB)
            </div>
            <div>
              <strong>enabled</strong> (optional): true/false (default: true)
            </div>
            <div>
              <strong>group</strong> (optional): Group name to assign the user
              to
            </div>
            <div>
              <strong>aliases</strong> (optional): Additional email aliases
              separated by semicolons
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Results</CardTitle>
            <CardDescription>
              Review the validation results before starting the import
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {preview.validRows.length}
                </div>
                <div className="text-sm text-muted-foreground">Valid Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {preview.invalidRows.length}
                </div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {preview.totalRows}
                </div>
                <div className="text-sm text-muted-foreground">Total Rows</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.ceil(preview.validRows.length / 500)}
                </div>
                <div className="text-sm text-muted-foreground">Batches</div>
              </div>
            </div>

            <ImportPreviewDialog
              preview={preview}
              onConfirm={handleStartImport}
              isLoading={startImportMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Import Status */}
      {currentJobId && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Import Status</h2>
          <ImportStatusCard jobId={currentJobId} />
        </div>
      )}
    </div>
  );
}
