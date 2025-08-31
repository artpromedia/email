import React, { useState, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Search,
  AlertCircle,
} from "lucide-react";
import { useAdminToast } from "../../hooks/useAdminToast";
import { useConfirm } from "../../hooks/useConfirm";
import { TrustedSendersPolicy, TrustedSender } from "../../data/policies";

interface TrustedSendersPolicyEditorProps {
  open: boolean;
  onClose: () => void;
  policy: TrustedSendersPolicy;
  onAddSender: (email: string, domain?: string) => Promise<void>;
  onRemoveSender: (id: string) => Promise<void>;
  onImportCSV: (file: File) => Promise<{ success: number; errors: string[] }>;
}

export const TrustedSendersPolicyEditor: React.FC<
  TrustedSendersPolicyEditorProps
> = ({ open, onClose, policy, onAddSender, onRemoveSender, onImportCSV }) => {
  const toast = useAdminToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDomain, setNewDomain] = useState("");

  const filteredSenders = policy.senders.filter(
    (sender) =>
      sender.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sender.notes &&
        sender.notes.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const handleAddSender = async () => {
    if (!newEmail.trim()) {
      toast.error("Email is required");
      return;
    }

    if (
      policy.senders.some(
        (sender) => sender.email.toLowerCase() === newEmail.toLowerCase(),
      )
    ) {
      toast.error("This email is already in the trusted senders list");
      return;
    }

    try {
      await onAddSender(newEmail, newDomain || undefined);
      setNewEmail("");
      setNewDomain("");
      toast.success("Trusted sender added successfully");
    } catch (error) {
      toast.error("Failed to add trusted sender");
    }
  };

  const handleRemoveSender = async (sender: TrustedSender) => {
    const confirmed = await confirm.show({
      title: "Remove Trusted Sender",
      message: `Remove ${sender.email} from trusted senders?`,
      confirmText: "Remove",
    });

    if (confirmed) {
      try {
        await onRemoveSender(sender.id);
        toast.success("Trusted sender removed successfully");
      } catch (error) {
        toast.error("Failed to remove trusted sender");
      }
    }
  };

  const handleExportCSV = () => {
    if (policy.senders.length === 0) {
      toast.error("No trusted senders to export");
      return;
    }

    const csvContent = [
      "Email,Domain,Description,Added Date",
      ...policy.senders.map(
        (sender) =>
          `"${sender.email}","${sender.domain || ""}","${sender.notes || ""}","${sender.addedAt}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trusted-senders-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success("Trusted senders exported successfully");
  };

  const handleImportCSV = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    try {
      const result = await onImportCSV(file);

      if (result.success > 0) {
        toast.success(
          `Successfully imported ${result.success} trusted senders`,
        );
      }

      if (result.errors.length > 0) {
        toast.error(
          `Failed to import ${result.errors.length} entries: ${result.errors.join(", ")}`,
        );
      }

      if (result.success === 0 && result.errors.length === 0) {
        toast.info("No new trusted senders were imported");
      }
    } catch (error) {
      toast.error("Failed to import CSV file");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[90vw] max-w-4xl">
        <SheetHeader>
          <SheetTitle>Trusted Senders Policy</SheetTitle>
          <SheetDescription>
            Manage email addresses and domains that are always considered
            trusted.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Import/Export Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bulk Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportCSV}
                  className="flex items-center gap-2"
                  disabled={policy.senders.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                CSV format: Email, Domain (optional), Description (optional)
              </p>
            </CardContent>
          </Card>

          {/* Add New Sender Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New Trusted Sender</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="domain">Domain (Optional)</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddSender}
                    className="w-full flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Sender
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search and List Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Trusted Senders ({policy.senders.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search trusted senders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {filteredSenders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? (
                    <>
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No trusted senders found matching "{searchTerm}"</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No trusted senders configured</p>
                      <p className="text-sm">
                        Add email addresses or domains that should always be
                        trusted
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSenders.map((sender) => (
                    <div
                      key={sender.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{sender.email}</div>
                        {sender.domain && (
                          <Badge variant="secondary">{sender.domain}</Badge>
                        )}
                        {sender.notes && (
                          <div className="text-sm text-muted-foreground">
                            {sender.notes}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Added: {new Date(sender.addedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSender(sender)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">About Trusted Senders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  • <strong>Email addresses:</strong> Specific email addresses
                  that bypass all filters
                </p>
                <p>
                  • <strong>Domain matching:</strong> All emails from specified
                  domains are trusted
                </p>
                <p>
                  • <strong>CSV Import:</strong> Bulk import with format: Email,
                  Domain, Description
                </p>
                <p>
                  • <strong>Priority:</strong> Trusted senders override all
                  other security policies
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};
