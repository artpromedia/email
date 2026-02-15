"use client";

/**
 * Mail Sidebar Component
 * Multi-domain folder navigation with collapsible sections
 */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Archive,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Folder,
  Users,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@email/ui";

import {
  useMailStore,
  type Domain,
  type Mailbox,
  type SharedMailbox,
  type MailFolder,
} from "@/lib/mail";

// No-operation function for disabled handlers
const noop = () => {
  /* intentionally empty */
};

// ============================================================
// ICON MAP
// ============================================================

const FOLDER_ICONS: Record<string, React.ElementType> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  trash: Trash2,
  archive: Archive,
  starred: Star,
  spam: AlertTriangle,
  custom: Folder,
};

// ============================================================
// FOLDER ITEM COMPONENT
// ============================================================

interface FolderItemProps {
  folder: MailFolder;
  isActive: boolean;
  onClick: () => void;
  depth?: number;
}

function FolderItem({ folder, isActive, onClick, depth = 0 }: FolderItemProps) {
  const Icon = FOLDER_ICONS[folder.type] || Folder;
  const hasChildren = folder.children && folder.children.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={onClick}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          isActive && "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
          !isActive && "text-neutral-700 dark:text-neutral-300"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}
        <Icon
          className={cn(
            "h-4 w-4 flex-shrink-0",
            folder.color || (isActive ? "text-blue-500" : "text-neutral-500")
          )}
        />
        <span className="flex-1 truncate text-left">{folder.name}</span>
        {folder.unreadCount > 0 && (
          <span
            className={cn(
              "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-medium",
              isActive
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
            )}
          >
            {folder.unreadCount}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {(folder.children ?? []).map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              isActive={false}
              onClick={noop}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DOMAIN SECTION COMPONENT
// ============================================================

interface DomainSectionProps {
  domain: Domain;
  isExpanded: boolean;
  onToggle: () => void;
  activeFolderId: string | null;
  onFolderSelect: (folder: MailFolder, mailbox: Mailbox | SharedMailbox) => void;
}

function DomainSection({
  domain,
  isExpanded,
  onToggle,
  activeFolderId,
  onFolderSelect,
}: DomainSectionProps) {
  return (
    <div className="mb-2">
      {/* Domain Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: domain.color }} />
        <span className="flex-1 truncate text-left">{domain.domain}</span>
        {!isExpanded && domain.unreadCount > 0 && (
          <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-medium text-white">
            {domain.unreadCount}
          </span>
        )}
      </button>

      {/* Mailboxes & Folders */}
      {isExpanded && (
        <div className="ml-1 space-y-1">
          {/* Primary Mailbox Folders */}
          {domain.mailboxes.map((mailbox) => (
            <div key={mailbox.id}>
              {mailbox.folders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isActive={activeFolderId === folder.id}
                  onClick={() => onFolderSelect(folder, mailbox)}
                />
              ))}
            </div>
          ))}

          {/* Shared Mailboxes */}
          {domain.sharedMailboxes.length > 0 && (
            <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
              <div className="px-2 py-1 text-xs font-medium text-neutral-400 dark:text-neutral-500">
                Shared
              </div>
              {domain.sharedMailboxes.map((mailbox) => {
                const firstFolder = mailbox.folders[0];
                if (!firstFolder) return null;
                return (
                  <button
                    key={mailbox.id}
                    onClick={() => onFolderSelect(firstFolder, mailbox)}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                      "text-neutral-700 dark:text-neutral-300"
                    )}
                  >
                    <Users className="h-4 w-4 text-neutral-500" />
                    <span className="flex-1 truncate text-left">{mailbox.email}</span>
                    {mailbox.unreadCount > 0 && (
                      <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                        {mailbox.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// UNIFIED FOLDERS SECTION
// ============================================================

interface UnifiedFoldersSectionProps {
  totalUnread: number;
  activeFolderId: string | null;
  onFolderSelect: (folderType: string) => void;
}

function UnifiedFoldersSection({
  totalUnread,
  activeFolderId,
  onFolderSelect,
}: UnifiedFoldersSectionProps) {
  const folders = [
    { id: "all-inbox", type: "inbox", name: "All Inboxes", icon: Inbox, unread: totalUnread },
    { id: "all-starred", type: "starred", name: "Starred", icon: Star, unread: 0 },
    { id: "all-sent", type: "sent", name: "Sent", icon: Send, unread: 0 },
    { id: "all-drafts", type: "drafts", name: "Drafts", icon: FileEdit, unread: 0 },
  ];

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
      {folders.map((folder) => {
        const Icon = folder.icon;
        const isActive = activeFolderId === folder.id;

        return (
          <button
            key={folder.id}
            onClick={() => onFolderSelect(folder.type)}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
              isActive && "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
              !isActive && "text-neutral-700 dark:text-neutral-300"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isActive ? "text-blue-500" : "text-neutral-500"
              )}
            />
            <span className="flex-1 truncate text-left">{folder.name}</span>
            {folder.unread > 0 && (
              <span
                className={cn(
                  "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-medium",
                  isActive
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                    : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                )}
              >
                {folder.unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN SIDEBAR COMPONENT
// ============================================================

interface MailSidebarProps {
  className?: string;
}

export function MailSidebar({ className }: MailSidebarProps) {
  const router = useRouter();

  const {
    domains,
    activeDomain,
    activeFolder,
    expandedDomains,
    sidebarCollapsed,
    setActiveDomain,
    setActiveMailbox,
    setActiveFolder,
    toggleDomainExpanded,
    toggleSidebar,
  } = useMailStore();

  // Calculate total unread
  const totalUnread = useMemo(
    () => domains.reduce((sum: number, d: Domain) => sum + d.unreadCount, 0),
    [domains]
  );

  // Get active folder ID
  const activeFolderId = activeFolder?.id ?? null;

  // Handle unified folder selection
  const handleUnifiedFolderSelect = useCallback(
    (folderType: string) => {
      setActiveDomain("all");
      router.push(`/mail/inbox?folder=${folderType}`);
    },
    [setActiveDomain, router]
  );

  // Handle domain folder selection
  const handleFolderSelect = useCallback(
    (folder: MailFolder, mailbox: Mailbox | SharedMailbox) => {
      // Find domain for this mailbox
      const domain = domains.find(
        (d: Domain) =>
          d.mailboxes.some((m: Mailbox) => m.id === mailbox.id) ||
          d.sharedMailboxes.some((m: SharedMailbox) => m.id === mailbox.id)
      );

      if (domain) {
        setActiveDomain(domain.id);
        setActiveMailbox(mailbox);
        setActiveFolder(folder);
        router.push(`/mail/inbox?domain=${domain.domain}&folder=${folder.type}`);
      }
    },
    [domains, setActiveDomain, setActiveMailbox, setActiveFolder, router]
  );

  if (sidebarCollapsed) {
    return (
      <div
        className={cn(
          "w-16 border-r border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900",
          className
        )}
      >
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="mt-4 space-y-2">
          <button className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Inbox className="h-5 w-5" />
          </button>
          <button className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Star className="h-5 w-5" />
          </button>
          <button className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "w-64 flex-shrink-0 bg-white dark:bg-neutral-900",
        "border-r border-neutral-200 dark:border-neutral-700",
        "flex flex-col",
        className
      )}
    >
      {/* Compose Button */}
      <div className="p-3">
        <button
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg",
            "bg-blue-600 px-4 py-2.5 text-sm font-medium text-white",
            "transition-colors hover:bg-blue-700",
            "shadow-sm"
          )}
          onClick={() => router.push("/mail/compose")}
        >
          <Plus className="h-4 w-4" />
          <span>Compose</span>
        </button>
      </div>

      {/* Scrollable Folder List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Unified Folders */}
        <UnifiedFoldersSection
          totalUnread={totalUnread}
          activeFolderId={activeDomain === "all" ? `all-${activeFolder?.type}` : null}
          onFolderSelect={handleUnifiedFolderSelect}
        />

        {/* Domain Sections */}
        {domains.map((domain: Domain) => (
          <DomainSection
            key={domain.id}
            domain={domain}
            isExpanded={expandedDomains.has(domain.id)}
            onToggle={() => toggleDomainExpanded(domain.id)}
            activeFolderId={activeDomain === domain.id ? activeFolderId : null}
            onFolderSelect={handleFolderSelect}
          />
        ))}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
        <button
          onClick={() => router.push("/settings/preferences")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <Settings className="h-4 w-4" />
          <span>Mail Settings</span>
        </button>
      </div>
    </aside>
  );
}

export default MailSidebar;
