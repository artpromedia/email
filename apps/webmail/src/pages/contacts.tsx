import { useState, useEffect } from "react";
import {
  Search,
  Upload,
  Download,
  Users,
  Star,
  Trash2,
  Edit,
  Mail,
  Phone,
  Building,
  MoreHorizontal,
  UserPlus,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreateContactDialog } from "@/components/CreateContactDialog";
import { EditContactDialog } from "@/components/EditContactDialog";
import { ImportContactsDialog } from "@/components/ImportContactsDialog";
import { ExportContactsDialog } from "@/components/ExportContactsDialog";
import { ManageGroupsDialog } from "@/components/ManageGroupsDialog";

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

export function ContactsPage() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  // Remove unused state for now
  // const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showGroupsDialog, setShowGroupsDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Mock data - in real app, fetch from API
  useEffect(() => {
    const mockContacts: Contact[] = [
      {
        id: "1",
        firstName: "John",
        lastName: "Doe",
        displayName: "John Doe",
        email: "john.doe@company.com",
        phone: "+1 (555) 123-4567",
        organization: "ACME Corp",
        department: "Engineering",
        title: "Senior Developer",
        groups: ["team", "favorites"],
        isFavorite: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "2",
        firstName: "Jane",
        lastName: "Smith",
        displayName: "Jane Smith",
        email: "jane.smith@company.com",
        phone: "+1 (555) 987-6543",
        organization: "ACME Corp",
        department: "Marketing",
        title: "Marketing Manager",
        groups: ["team"],
        isFavorite: false,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "3",
        firstName: "Bob",
        lastName: "Wilson",
        displayName: "Bob Wilson",
        email: "bob.wilson@external.com",
        phone: "+1 (555) 555-5555",
        organization: "External Partners",
        department: "Sales",
        title: "Account Executive",
        groups: ["external"],
        isFavorite: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    const mockGroups: ContactGroup[] = [
      {
        id: "team",
        name: "Team",
        description: "Internal team members",
        color: "#3b82f6",
        contactCount: 2,
      },
      {
        id: "favorites",
        name: "Favorites",
        description: "Favorite contacts",
        color: "#eab308",
        contactCount: 2,
      },
      {
        id: "external",
        name: "External",
        description: "External contacts",
        color: "#10b981",
        contactCount: 1,
      },
    ];

    setContacts(mockContacts);
    setGroups(mockGroups);
  }, []);

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch =
      contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.organization?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGroup =
      selectedGroup === "all" ||
      (selectedGroup === "favorites" && contact.isFavorite) ||
      contact.groups.includes(selectedGroup);

    return matchesSearch && matchesGroup;
  });

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setShowEditDialog(true);
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts(contacts.filter((c) => c.id !== contactId));
    toast({
      title: "Contact deleted",
      description: "Contact has been removed from your address book",
    });
  };

  const handleToggleFavorite = (contactId: string) => {
    setContacts(
      contacts.map((c) =>
        c.id === contactId ? { ...c, isFavorite: !c.isFavorite } : c,
      ),
    );
  };

  const handleBulkAction = (action: string) => {
    switch (action) {
      case "delete":
        setContacts(contacts.filter((c) => !selectedContacts.includes(c.id)));
        setSelectedContacts([]);
        toast({
          title: `${selectedContacts.length} contacts deleted`,
          description: "Selected contacts have been removed",
        });
        break;
      case "favorite":
        setContacts(
          contacts.map((c) =>
            selectedContacts.includes(c.id) ? { ...c, isFavorite: true } : c,
          ),
        );
        setSelectedContacts([]);
        toast({
          title: `${selectedContacts.length} contacts favorited`,
          description: "Selected contacts have been added to favorites",
        });
        break;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your contacts and address book
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setShowExportDialog(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts by name, email, or organization..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contacts</SelectItem>
            <SelectItem value="favorites">Favorites</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name} ({group.contactCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowGroupsDialog(true)}>
          <Tags className="h-4 w-4 mr-2" />
          Groups
        </Button>
      </div>

      {/* Bulk Actions */}
      {selectedContacts.length > 0 && (
        <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedContacts.length} contact
            {selectedContacts.length > 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction("favorite")}
          >
            <Star className="h-4 w-4 mr-1" />
            Add to Favorites
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction("delete")}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedContacts([])}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Contact Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredContacts.map((contact) => (
          <Card
            key={contact.id}
            className="relative group hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={contact.avatar}
                      alt={contact.displayName}
                    />
                    <AvatarFallback>
                      {getInitials(contact.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {contact.displayName}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {contact.isFavorite && (
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEditContact(contact)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleFavorite(contact.id)}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        {contact.isFavorite ? "Remove from" : "Add to"}{" "}
                        Favorites
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteContact(contact.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {contact.title && contact.organization && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building className="h-3 w-3" />
                    <span className="truncate">
                      {contact.title} at {contact.organization}
                    </span>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Mail className="h-3 w-3 mr-1" />
                    Email
                  </Button>
                  {contact.phone && (
                    <Button size="sm" variant="outline" className="flex-1">
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </Button>
                  )}
                </div>
                {contact.groups.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.groups.map((groupId) => {
                      const group = groups.find((g) => g.id === groupId);
                      return group ? (
                        <Badge
                          key={groupId}
                          variant="secondary"
                          className="text-xs"
                        >
                          {group.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredContacts.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No contacts found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || selectedGroup !== "all"
              ? "Try adjusting your search or filter criteria"
              : "Get started by adding your first contact"}
          </p>
          {!searchQuery && selectedGroup === "all" && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Your First Contact
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateContactDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        groups={groups}
        onContactCreated={(contact: Contact) => {
          setContacts([...contacts, contact]);
          toast({
            title: "Contact created",
            description: `${contact.displayName} has been added to your contacts`,
          });
        }}
      />

      <EditContactDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        contact={editingContact}
        groups={groups}
        onContactUpdated={(updatedContact: Contact) => {
          setContacts(
            contacts.map((c) =>
              c.id === updatedContact.id ? updatedContact : c,
            ),
          );
          toast({
            title: "Contact updated",
            description: `${updatedContact.displayName} has been updated`,
          });
        }}
      />

      <ImportContactsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        groups={groups}
        onContactsImported={(importedContacts: Contact[]) => {
          setContacts([...contacts, ...importedContacts]);
          toast({
            title: "Contacts imported",
            description: `${importedContacts.length} contacts have been imported`,
          });
        }}
      />

      <ExportContactsDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        contacts={filteredContacts}
        groups={groups}
      />

      <ManageGroupsDialog
        open={showGroupsDialog}
        onOpenChange={setShowGroupsDialog}
        groups={groups}
        onGroupsUpdated={setGroups}
      />
    </div>
  );
}

export default ContactsPage;
