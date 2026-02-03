"use client";

/**
 * Contact Picker Component
 * Modal for browsing and selecting contacts from the address book
 */

import { useState, useCallback, useMemo } from "react";
import { X, Search, Users, User, Building2, Star, Check, Clock, Mail, Plus } from "lucide-react";
import { cn } from "@email/ui";

import type { EmailRecipient } from "@/lib/mail";

// ============================================================
// TYPES
// ============================================================

export interface Contact {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  avatarUrl?: string;
  isInternal?: boolean;
  domainId?: string;
  isFavorite?: boolean;
  lastContacted?: string;
  groups?: string[];
}

export interface ContactGroup {
  id: string;
  name: string;
  count: number;
  color?: string;
}

interface ContactPickerProps {
  /** Whether the picker is open */
  isOpen: boolean;
  /** Callback when picker is closed */
  onClose: () => void;
  /** Callback when contacts are selected */
  onSelect: (contacts: EmailRecipient[]) => void;
  /** Currently selected recipients (to avoid duplicates) */
  existingRecipients?: EmailRecipient[];
  /** Allow multiple selection */
  multiple?: boolean;
  /** Title for the modal */
  title?: string;
  /** Contact data (would come from API in real app) */
  contacts?: Contact[];
  /** Contact groups */
  groups?: ContactGroup[];
  /** Recent contacts */
  recentContacts?: Contact[];
}

// ============================================================
// MOCK DATA (Replace with API call)
// ============================================================

const DEFAULT_CONTACTS: Contact[] = [
  {
    id: "1",
    email: "john.doe@company.com",
    name: "John Doe",
    company: "Acme Corp",
    isInternal: true,
    domainId: "company.com",
    isFavorite: true,
    groups: ["engineering"],
  },
  {
    id: "2",
    email: "jane.smith@company.com",
    name: "Jane Smith",
    company: "Acme Corp",
    isInternal: true,
    domainId: "company.com",
    groups: ["engineering", "leadership"],
  },
  {
    id: "3",
    email: "bob.wilson@external.com",
    name: "Bob Wilson",
    company: "External Inc",
    isInternal: false,
    groups: ["partners"],
  },
  {
    id: "4",
    email: "alice@contractor.io",
    name: "Alice Johnson",
    company: "Contractor.io",
    isInternal: false,
    isFavorite: true,
    groups: ["contractors"],
  },
  {
    id: "5",
    email: "support@vendor.com",
    name: "Vendor Support",
    company: "Vendor Inc",
    isInternal: false,
    groups: ["vendors"],
  },
];

const DEFAULT_GROUPS: ContactGroup[] = [
  { id: "all", name: "All Contacts", count: 5 },
  { id: "internal", name: "Internal", count: 2, color: "#22c55e" },
  { id: "external", name: "External", count: 3, color: "#3b82f6" },
  { id: "engineering", name: "Engineering", count: 2, color: "#8b5cf6" },
  { id: "leadership", name: "Leadership", count: 1, color: "#f97316" },
];

// ============================================================
// AVATAR COMPONENT
// ============================================================

interface ContactAvatarProps {
  contact: Contact;
  size?: "sm" | "md" | "lg";
}

function ContactAvatar({ contact, size = "md" }: ContactAvatarProps) {
  const initials = contact.name
    ? contact.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (contact.email[0]?.toUpperCase() ?? "?");

  // Generate consistent color from email
  let hash = 0;
  for (let i = 0; i < contact.email.length; i++) {
    hash = (contact.email.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  if (contact.avatarUrl) {
    return (
      <img
        src={contact.avatarUrl}
        alt={contact.name ?? contact.email}
        className={cn("rounded-full object-cover", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white",
        sizeClasses[size]
      )}
      style={{ backgroundColor: `hsl(${hue}, 65%, 55%)` }}
    >
      {initials}
    </div>
  );
}

// ============================================================
// CONTACT LIST ITEM
// ============================================================

interface ContactListItemProps {
  contact: Contact;
  isSelected: boolean;
  onToggle: () => void;
}

function ContactListItem({ contact, isSelected, onToggle }: ContactListItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
        isSelected && "bg-blue-50 dark:bg-blue-950/30"
      )}
    >
      {/* Selection checkbox */}
      <div
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
          isSelected
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-neutral-300 dark:border-neutral-600"
        )}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>

      {/* Avatar */}
      <ContactAvatar contact={contact} />

      {/* Contact info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {contact.name ?? contact.email}
          </span>
          {contact.isFavorite && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
          {contact.isInternal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Building2 className="h-3 w-3" />
              Internal
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <Mail className="h-3 w-3" />
          <span className="truncate">{contact.email}</span>
        </div>
        {contact.company && (
          <div className="text-xs text-neutral-400 dark:text-neutral-500">{contact.company}</div>
        )}
      </div>
    </button>
  );
}

// ============================================================
// GROUP SIDEBAR ITEM
// ============================================================

interface GroupItemProps {
  group: ContactGroup;
  isActive: boolean;
  onClick: () => void;
}

function GroupItem({ group, isActive, onClick }: GroupItemProps) {
  const Icon = group.id === "internal" ? Building2 : group.id === "all" ? Users : User;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
        isActive
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      )}
    >
      <Icon
        className="h-4 w-4 flex-shrink-0"
        style={group.color ? { color: group.color } : undefined}
      />
      <span className="flex-1 truncate text-sm font-medium">{group.name}</span>
      <span className="text-xs text-neutral-400">{group.count}</span>
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ContactPicker({
  isOpen,
  onClose,
  onSelect,
  existingRecipients = [],
  multiple = true,
  title = "Select Contacts",
  contacts = DEFAULT_CONTACTS,
  groups = DEFAULT_GROUPS,
  recentContacts,
}: ContactPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Filter contacts based on search and group
  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Filter by group
    if (selectedGroup !== "all") {
      if (selectedGroup === "internal") {
        filtered = filtered.filter((c) => c.isInternal);
      } else if (selectedGroup === "external") {
        filtered = filtered.filter((c) => !c.isInternal);
      } else {
        filtered = filtered.filter((c) => c.groups?.includes(selectedGroup));
      }
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.email.toLowerCase().includes(query) ||
          (c.name?.toLowerCase().includes(query) ?? false) ||
          (c.company?.toLowerCase().includes(query) ?? false)
      );
    }

    // Exclude already selected recipients
    const existingEmails = new Set(existingRecipients.map((r) => r.email.toLowerCase()));
    filtered = filtered.filter((c) => !existingEmails.has(c.email.toLowerCase()));

    return filtered;
  }, [contacts, selectedGroup, searchQuery, existingRecipients]);

  // Toggle contact selection
  const toggleContact = useCallback(
    (contactId: string) => {
      setSelectedContacts((prev) => {
        const next = new Set(prev);
        if (next.has(contactId)) {
          next.delete(contactId);
        } else {
          if (!multiple) {
            next.clear();
          }
          next.add(contactId);
        }
        return next;
      });
    },
    [multiple]
  );

  // Handle confirm
  const handleConfirm = useCallback(() => {
    const selected = contacts.filter((c) => selectedContacts.has(c.id));
    const recipients: EmailRecipient[] = selected.map((c) => ({
      email: c.email,
      name: c.name,
      isInternal: c.isInternal ?? false,
      internalDomainId: c.domainId,
      isValid: true,
    }));
    onSelect(recipients);
    setSelectedContacts(new Set());
    onClose();
  }, [contacts, selectedContacts, onSelect, onClose]);

  // Handle close
  const handleClose = useCallback(() => {
    setSelectedContacts(new Set());
    setSearchQuery("");
    setSelectedGroup("all");
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        onKeyDown={(e) => e.key === "Escape" && handleClose()}
        role="button"
        tabIndex={0}
        aria-label="Close contact picker"
      />

      {/* Modal */}
      <div className="relative flex h-[600px] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className={cn(
                "w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4",
                "text-neutral-900 placeholder-neutral-400",
                "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500",
                "dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
              )}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Group sidebar */}
          <div className="w-48 border-r border-neutral-200 p-3 dark:border-neutral-700">
            <div className="space-y-1">
              {groups.map((group) => (
                <GroupItem
                  key={group.id}
                  group={group}
                  isActive={selectedGroup === group.id}
                  onClick={() => setSelectedGroup(group.id)}
                />
              ))}
            </div>

            {/* Recent contacts section */}
            {recentContacts && recentContacts.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 flex items-center gap-2 px-3 text-xs font-medium uppercase text-neutral-400">
                  <Clock className="h-3 w-3" />
                  Recent
                </div>
                {recentContacts.slice(0, 5).map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleContact(contact.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors",
                      selectedContacts.has(contact.id)
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    )}
                  >
                    <ContactAvatar contact={contact} size="sm" />
                    <span className="truncate text-sm">{contact.name ?? contact.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-auto">
            {filteredContacts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-neutral-500">
                <Users className="mb-2 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
                <p>No contacts found</p>
                {searchQuery && <p className="text-sm">Try a different search term</p>}
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredContacts.map((contact) => (
                  <ContactListItem
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContacts.has(contact.id)}
                    onToggle={() => toggleContact(contact.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            {selectedContacts.size > 0
              ? `${selectedContacts.size} contact${selectedContacts.size === 1 ? "" : "s"} selected`
              : "No contacts selected"}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium",
                "text-neutral-700 hover:bg-neutral-100",
                "dark:text-neutral-300 dark:hover:bg-neutral-800"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedContacts.size === 0}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
                "bg-blue-600 text-white hover:bg-blue-700",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Plus className="h-4 w-4" />
              Add {selectedContacts.size > 0 ? `(${selectedContacts.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContactPicker;
