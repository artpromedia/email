"use client";

/**
 * Contacts Page
 * View and manage contacts
 */

import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Building2,
  MapPin,
  Star,
  MoreVertical,
  Edit,
  Trash2,
  Upload,
  Download,
  Filter,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@email/ui";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  address?: string;
  avatar?: string;
  favorite: boolean;
  groups: string[];
  createdAt: string;
}

interface ContactGroup {
  id: string;
  name: string;
  count: number;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [groups, setGroups] = useState<ContactGroup[]>([
    { id: "all", name: "All Contacts", count: 0 },
    { id: "favorites", name: "Favorites", count: 0 },
  ]);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/v1/contacts");
        const data = (await response.json()) as { contacts: Contact[] };
        setContacts(data.contacts);
        // Update group counts
        const favorites = data.contacts.filter((c: Contact) => c.favorite).length;
        setGroups([
          { id: "all", name: "All Contacts", count: data.contacts.length },
          { id: "favorites", name: "Favorites", count: favorites },
        ]);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
        setError("Failed to load contacts");
      } finally {
        setLoading(false);
      }
    };
    void fetchContacts();
  }, []);

  const [selectedGroup, setSelectedGroup] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    jobTitle: "",
    address: "",
  });

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch =
      searchQuery === "" ||
      `${contact.firstName} ${contact.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGroup =
      selectedGroup === "all" ||
      (selectedGroup === "favorites" && contact.favorite) ||
      contact.groups.includes(selectedGroup);

    return matchesSearch && matchesGroup;
  });

  const handleAddContact = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      if (editingContactId) {
        const response = await fetch(`/api/v1/contacts/${editingContactId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(newContact),
        });
        if (response.ok) {
          const result = (await response.json()) as { contact: Contact };
          setContacts(contacts.map((c) => (c.id === editingContactId ? result.contact : c)));
        }
      } else {
        const response = await fetch("/api/v1/contacts", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...newContact,
            favorite: false,
            groups: [],
          }),
        });
        if (response.ok) {
          const result = (await response.json()) as { contact: Contact };
          setContacts([...contacts, result.contact]);
        }
      }
      setAddDialogOpen(false);
      setEditingContactId(null);
      setNewContact({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        company: "",
        jobTitle: "",
        address: "",
      });
    } catch (err) {
      console.error("Failed to save contact:", err);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      try {
        const response = await fetch(`/api/v1/contacts/${contactId}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setContacts(contacts.filter((c) => c.id !== contactId));
          if (selectedContact?.id === contactId) {
            setSelectedContact(null);
          }
        }
      } catch (err) {
        console.error("Failed to delete contact:", err);
      }
    }
  };

  const handleToggleFavorite = async (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    try {
      const response = await fetch(`/api/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !contact.favorite }),
      });
      if (response.ok) {
        setContacts(
          contacts.map((c) => (c.id === contactId ? { ...c, favorite: !c.favorite } : c))
        );
      }
    } catch (err) {
      console.error("Failed to update contact:", err);
    }
  };

  const handleEditContact = (contact: Contact) => {
    setNewContact({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone ?? "",
      company: contact.company ?? "",
      jobTitle: contact.jobTitle ?? "",
      address: contact.address ?? "",
    });
    setEditingContactId(contact.id);
    setAddDialogOpen(true);
  };

  const handleExportContacts = () => {
    const csvHeaders = [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Company",
      "Job Title",
      "Address",
    ];
    const rows = contacts.map((c) => [
      c.firstName,
      c.lastName,
      c.email,
      c.phone ?? "",
      c.company ?? "",
      c.jobTitle ?? "",
      c.address ?? "",
    ]);
    const csv = [csvHeaders.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join(
      "\n"
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportContacts = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.vcf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const token = localStorage.getItem("accessToken");
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/v1/contacts/import", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (response.ok) {
          const result = (await response.json()) as { contacts: Contact[] };
          setContacts((prev) => [...prev, ...result.contacts]);
        }
      } catch (err) {
        console.error("Failed to import contacts:", err);
      }
    };
    input.click();
  };

  const getInitials = (contact: Contact) => {
    return `${contact.firstName[0]}${contact.lastName[0]}`.toUpperCase();
  };

  const handleDialogOpenChange = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) setEditingContactId(null);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r p-4">
        <Dialog open={addDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button
              className="mb-4 w-full"
              onClick={() => {
                setEditingContactId(null);
                setNewContact({
                  firstName: "",
                  lastName: "",
                  email: "",
                  phone: "",
                  company: "",
                  jobTitle: "",
                  address: "",
                });
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContactId ? "Edit Contact" : "Add New Contact"}</DialogTitle>
              <DialogDescription>
                {editingContactId
                  ? "Update the contact information."
                  : "Enter the contact information below."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={newContact.firstName}
                    onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={newContact.lastName}
                    onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={newContact.company}
                  onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  value={newContact.jobTitle}
                  onChange={(e) => setNewContact({ ...newContact, jobTitle: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAddDialogOpen(false);
                  setEditingContactId(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddContact}>
                {editingContactId ? "Save Changes" : "Add Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-1">
          {groups.map((group) => (
            <button
              key={group.id}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${
                selectedGroup === group.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => setSelectedGroup(group.id)}
            >
              <span>{group.name}</span>
              <Badge variant="secondary">{group.count}</Badge>
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-2 border-t pt-4">
          <Button variant="outline" className="w-full" size="sm" onClick={handleImportContacts}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" className="w-full" size="sm" onClick={handleExportContacts}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Contact List */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-4 border-b p-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={filterActive ? "default" : "outline"}
            size="icon"
            onClick={() => {
              setFilterActive(!filterActive);
              setSelectedGroup(filterActive ? "all" : "favorites");
            }}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <p className="font-medium text-red-500">{error}</p>
              <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1">
            {/* Contact List Panel */}
            <div className="w-1/2 overflow-auto border-r">
              {filteredContacts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No contacts found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      role="button"
                      tabIndex={0}
                      className={`flex cursor-pointer items-center gap-4 p-4 hover:bg-muted ${
                        selectedContact?.id === contact.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedContact(contact)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedContact(contact);
                      }}
                    >
                      <Avatar>
                        <AvatarImage src={contact.avatar} />
                        <AvatarFallback>{getInitials(contact)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {contact.firstName} {contact.lastName}
                          </span>
                          {contact.favorite && (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          )}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {contact.email}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleFavorite(contact.id)}>
                            <Star className="mr-2 h-4 w-4" />
                            {contact.favorite ? "Remove from Favorites" : "Add to Favorites"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteContact(contact.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Detail Panel */}
            <div className="w-1/2 overflow-auto">
              {selectedContact ? (
                <div className="p-6">
                  <div className="mb-6 flex items-start gap-6">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={selectedContact.avatar} />
                      <AvatarFallback className="text-2xl">
                        {getInitials(selectedContact)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-2xl font-bold">
                        {selectedContact.firstName} {selectedContact.lastName}
                      </h2>
                      {selectedContact.jobTitle && (
                        <p className="text-muted-foreground">
                          {selectedContact.jobTitle}
                          {selectedContact.company && ` at ${selectedContact.company}`}
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button size="sm">
                          <Mail className="mr-2 h-4 w-4" />
                          Send Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleFavorite(selectedContact.id)}
                        >
                          <Star
                            className={`mr-2 h-4 w-4 ${
                              selectedContact.favorite ? "fill-yellow-400 text-yellow-400" : ""
                            }`}
                          />
                          {selectedContact.favorite ? "Favorited" : "Favorite"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Email</div>
                          <a
                            href={`mailto:${selectedContact.email}`}
                            className="text-primary hover:underline"
                          >
                            {selectedContact.email}
                          </a>
                        </div>
                      </div>
                      {selectedContact.phone && (
                        <div className="flex items-center gap-3">
                          <Phone className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm text-muted-foreground">Phone</div>
                            <a
                              href={`tel:${selectedContact.phone}`}
                              className="text-primary hover:underline"
                            >
                              {selectedContact.phone}
                            </a>
                          </div>
                        </div>
                      )}
                      {selectedContact.company && (
                        <div className="flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm text-muted-foreground">Company</div>
                            <div>{selectedContact.company}</div>
                          </div>
                        </div>
                      )}
                      {selectedContact.address && (
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm text-muted-foreground">Address</div>
                            <div>{selectedContact.address}</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {selectedContact.groups.length > 0 && (
                    <Card className="mt-4">
                      <CardHeader>
                        <CardTitle>Groups</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {selectedContact.groups.map((group) => (
                            <Badge key={group} variant="secondary">
                              {group.charAt(0).toUpperCase() + group.slice(1)}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p>Select a contact to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
