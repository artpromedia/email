import { useState } from "react";
import { Download, FileText, Users, Filter, CheckCircle } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface ExportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  groups: ContactGroup[];
  selectedContacts?: string[];
}

export function ExportContactsDialog({
  open,
  onOpenChange,
  contacts,
  groups,
  selectedContacts = [],
}: ExportContactsDialogProps) {
  const [exportFormat, setExportFormat] = useState<"csv" | "vcard">("csv");
  const [exportScope, setExportScope] = useState<
    "all" | "selected" | "filtered"
  >(selectedContacts.length > 0 ? "selected" : "all");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeFields, setIncludeFields] = useState({
    name: true,
    email: true,
    phone: true,
    organization: true,
    department: true,
    title: true,
    groups: true,
    notes: false,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);

  const getFilteredContacts = () => {
    let filtered = contacts;

    // Apply scope filter
    if (exportScope === "selected" && selectedContacts.length > 0) {
      filtered = filtered.filter((contact) =>
        selectedContacts.includes(contact.id),
      );
    } else if (exportScope === "filtered") {
      // Apply group filter
      if (selectedGroups.length > 0) {
        filtered = filtered.filter((contact) =>
          contact.groups.some((groupId) => selectedGroups.includes(groupId)),
        );
      }

      // Apply favorites filter
      if (favoritesOnly) {
        filtered = filtered.filter((contact) => contact.isFavorite);
      }
    }

    return filtered;
  };

  const generateCSV = (contactsToExport: Contact[]) => {
    const headers = [];
    if (includeFields.name) {
      headers.push("First Name", "Last Name", "Display Name");
    }
    if (includeFields.email) headers.push("Email");
    if (includeFields.phone) headers.push("Phone");
    if (includeFields.organization) headers.push("Organization");
    if (includeFields.department) headers.push("Department");
    if (includeFields.title) headers.push("Title");
    if (includeFields.groups) headers.push("Groups");

    const csvContent = [
      headers.join(","),
      ...contactsToExport.map((contact) => {
        const row = [];
        if (includeFields.name) {
          row.push(
            `"${contact.firstName || ""}"`,
            `"${contact.lastName || ""}"`,
            `"${contact.displayName || ""}"`,
          );
        }
        if (includeFields.email) row.push(`"${contact.email || ""}"`);
        if (includeFields.phone) row.push(`"${contact.phone || ""}"`);
        if (includeFields.organization)
          row.push(`"${contact.organization || ""}"`);
        if (includeFields.department) row.push(`"${contact.department || ""}"`);
        if (includeFields.title) row.push(`"${contact.title || ""}"`);
        if (includeFields.groups) {
          const groupNames = contact.groups
            .map((groupId) => groups.find((g) => g.id === groupId)?.name)
            .filter(Boolean)
            .join("; ");
          row.push(`"${groupNames}"`);
        }
        return row.join(",");
      }),
    ].join("\n");

    return csvContent;
  };

  const generateVCard = (contactsToExport: Contact[]) => {
    return contactsToExport
      .map((contact) => {
        const vcard = ["BEGIN:VCARD", "VERSION:3.0"];

        if (includeFields.name) {
          vcard.push(`FN:${contact.displayName || contact.email}`);
          if (contact.firstName || contact.lastName) {
            vcard.push(
              `N:${contact.lastName || ""};${contact.firstName || ""};;;`,
            );
          }
        }

        if (includeFields.email && contact.email) {
          vcard.push(`EMAIL:${contact.email}`);
        }

        if (includeFields.phone && contact.phone) {
          vcard.push(`TEL:${contact.phone}`);
        }

        if (includeFields.organization && contact.organization) {
          vcard.push(`ORG:${contact.organization}`);
        }

        if (includeFields.title && contact.title) {
          vcard.push(`TITLE:${contact.title}`);
        }

        if (includeFields.groups && contact.groups.length > 0) {
          const groupNames = contact.groups
            .map((groupId) => groups.find((g) => g.id === groupId)?.name)
            .filter(Boolean)
            .join(",");
          if (groupNames) {
            vcard.push(`CATEGORIES:${groupNames}`);
          }
        }

        vcard.push("END:VCARD");
        return vcard.join("\n");
      })
      .join("\n\n");
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const contactsToExport = getFilteredContacts();

      if (contactsToExport.length === 0) {
        alert("No contacts match the selected criteria.");
        setIsExporting(false);
        return;
      }

      let content = "";
      let filename = "";
      let mimeType = "";

      if (exportFormat === "csv") {
        content = generateCSV(contactsToExport);
        filename = `contacts_${new Date().toISOString().split("T")[0]}.csv`;
        mimeType = "text/csv";
      } else {
        content = generateVCard(contactsToExport);
        filename = `contacts_${new Date().toISOString().split("T")[0]}.vcf`;
        mimeType = "text/vcard";
      }

      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setExportComplete(true);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setExportFormat("csv");
    setExportScope(selectedContacts.length > 0 ? "selected" : "all");
    setSelectedGroups([]);
    setFavoritesOnly(false);
    setIncludeFields({
      name: true,
      email: true,
      phone: true,
      organization: true,
      department: true,
      title: true,
      groups: true,
      notes: false,
    });
    setIsExporting(false);
    setExportComplete(false);
    onOpenChange(false);
  };

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const contactCount = getFilteredContacts().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Contacts
          </DialogTitle>
          <DialogDescription>
            Export your contacts to CSV or vCard format
          </DialogDescription>
        </DialogHeader>

        {exportComplete ? (
          <div className="space-y-4 py-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Export Complete!</h3>
              <p className="text-gray-600">
                Your contacts have been successfully exported and downloaded.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Export Format */}
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select
                value={exportFormat}
                onValueChange={(value) => setExportFormat(value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    CSV (Comma Separated Values)
                  </SelectItem>
                  <SelectItem value="vcard">vCard (.vcf)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500">
                {exportFormat === "csv" &&
                  "Compatible with Excel, Google Sheets, and other spreadsheet applications"}
                {exportFormat === "vcard" &&
                  "Standard format compatible with most email clients and contact apps"}
              </div>
            </div>

            {/* Export Scope */}
            <div className="space-y-2">
              <Label>What to Export</Label>
              <Select
                value={exportScope}
                onValueChange={(value) => setExportScope(value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All contacts ({contacts.length})
                  </SelectItem>
                  {selectedContacts.length > 0 && (
                    <SelectItem value="selected">
                      Selected contacts ({selectedContacts.length})
                    </SelectItem>
                  )}
                  <SelectItem value="filtered">Filtered contacts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter Options */}
            {exportScope === "filtered" && (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <h4 className="font-medium">Filter Options</h4>
                </div>

                {groups.length > 0 && (
                  <div className="space-y-2">
                    <Label>Groups</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {groups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`export-group-${group.id}`}
                            checked={selectedGroups.includes(group.id)}
                            onCheckedChange={() => handleGroupToggle(group.id)}
                          />
                          <Label
                            htmlFor={`export-group-${group.id}`}
                            className="text-sm cursor-pointer flex items-center gap-2"
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            {group.name} ({group.contactCount})
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="favorites-only"
                    checked={favoritesOnly}
                    onCheckedChange={setFavoritesOnly}
                  />
                  <Label
                    htmlFor="favorites-only"
                    className="text-sm cursor-pointer"
                  >
                    Favorites only
                  </Label>
                </div>
              </div>
            )}

            <Separator />

            {/* Fields to Include */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <h4 className="font-medium">Fields to Include</h4>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-name"
                    checked={includeFields.name}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({ ...prev, name: !!checked }))
                    }
                  />
                  <Label
                    htmlFor="include-name"
                    className="text-sm cursor-pointer"
                  >
                    Name
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-email"
                    checked={includeFields.email}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        email: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-email"
                    className="text-sm cursor-pointer"
                  >
                    Email
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-phone"
                    checked={includeFields.phone}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        phone: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-phone"
                    className="text-sm cursor-pointer"
                  >
                    Phone
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-organization"
                    checked={includeFields.organization}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        organization: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-organization"
                    className="text-sm cursor-pointer"
                  >
                    Organization
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-department"
                    checked={includeFields.department}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        department: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-department"
                    className="text-sm cursor-pointer"
                  >
                    Department
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-title"
                    checked={includeFields.title}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        title: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-title"
                    className="text-sm cursor-pointer"
                  >
                    Job Title
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-groups"
                    checked={includeFields.groups}
                    onCheckedChange={(checked) =>
                      setIncludeFields((prev) => ({
                        ...prev,
                        groups: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="include-groups"
                    className="text-sm cursor-pointer"
                  >
                    Groups
                  </Label>
                </div>
              </div>
            </div>

            {/* Export Summary */}
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>{contactCount}</strong> contact
                {contactCount !== 1 ? "s" : ""} will be exported
                {exportScope === "selected" &&
                  ` (${selectedContacts.length} selected)`}
                {exportScope === "filtered" &&
                  selectedGroups.length > 0 &&
                  ` from ${selectedGroups.length} group${selectedGroups.length !== 1 ? "s" : ""}`}
                {exportScope === "filtered" &&
                  favoritesOnly &&
                  " (favorites only)"}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {exportComplete ? "Close" : "Cancel"}
          </Button>
          {!exportComplete && (
            <Button
              onClick={handleExport}
              disabled={isExporting || contactCount === 0}
            >
              {isExporting
                ? "Exporting..."
                : `Export ${contactCount} Contact${contactCount !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
