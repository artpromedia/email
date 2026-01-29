"use client";

/**
 * Move Email Dialog Component
 * Cross-domain folder selection for moving/copying emails
 */

import { useState, useMemo, useCallback } from "react";
import {
  X,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderInput,
  Inbox,
  Archive,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, Button } from "@email/ui";

import {
  useMailStore,
  useMoveEmails,
  type Domain,
  type MailFolder,
  type MoveDestination,
} from "@/lib/mail";

// ============================================================
// FOLDER TREE ITEM
// ============================================================

interface FolderTreeItemProps {
  folder: MailFolder;
  domainId: string;
  domainName: string;
  domainColor: string;
  depth: number;
  selectedFolderId: string | null;
  onSelect: (destination: MoveDestination) => void;
}

function FolderTreeItem({
  folder,
  domainId,
  domainName,
  domainColor,
  depth,
  selectedFolderId,
  onSelect,
}: FolderTreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;

  const handleClick = () => {
    onSelect({
      domainId,
      mailboxId: folder.mailboxId,
      folderId: folder.id,
      folderName: folder.name,
      domainName,
    });
  };

  const Icon =
    folder.type === "inbox"
      ? Inbox
      : folder.type === "archive"
        ? Archive
        : folder.type === "trash"
          ? Trash2
          : Folder;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          isSelected && "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <div className="w-4" />
        )}
        <Icon className={cn("h-4 w-4", isSelected ? "text-blue-500" : "text-neutral-500")} />
        <span className="flex-1 truncate text-left">{folder.name}</span>
      </button>

      {hasChildren && expanded && (
        <div>
          {(folder.children ?? []).map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              domainId={domainId}
              domainName={domainName}
              domainColor={domainColor}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DOMAIN SECTION
// ============================================================

interface DomainSectionProps {
  domain: Domain;
  selectedFolderId: string | null;
  onSelect: (destination: MoveDestination) => void;
}

function DomainSection({ domain, selectedFolderId, onSelect }: DomainSectionProps) {
  const [expanded, setExpanded] = useState(true);

  // Get all folders from all mailboxes
  const allFolders = useMemo(() => {
    const folders: MailFolder[] = [];
    domain.mailboxes.forEach((mailbox) => {
      folders.push(...mailbox.folders);
    });
    return folders;
  }, [domain]);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: domain.color }} />
        <span className="flex-1 text-left">{domain.domain}</span>
      </button>

      {expanded && (
        <div className="ml-2">
          {allFolders.map((folder) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              domainId={domain.id}
              domainName={domain.domain}
              domainColor={domain.color}
              depth={0}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN DIALOG COMPONENT
// ============================================================

interface MoveEmailDialogProps {
  isOpen: boolean;
  emailIds: string[];
  currentDomainId: string;
  action: "move" | "copy";
  onClose: () => void;
  onSuccess?: () => void;
}

export function MoveEmailDialog({
  isOpen,
  emailIds,
  currentDomainId,
  action,
  onClose,
  onSuccess,
}: MoveEmailDialogProps) {
  const { domains } = useMailStore();
  const moveEmailsMutation = useMoveEmails();

  const [selectedDestination, setSelectedDestination] = useState<MoveDestination | null>(null);
  const [showCrossDomainConfirm, setShowCrossDomainConfirm] = useState(false);

  // Check if cross-domain move
  const isCrossDomain = useMemo(() => {
    return selectedDestination && selectedDestination.domainId !== currentDomainId;
  }, [selectedDestination, currentDomainId]);

  // Handle folder selection
  const handleSelect = useCallback((destination: MoveDestination) => {
    setSelectedDestination(destination);
    setShowCrossDomainConfirm(false);
  }, []);

  // Handle move/copy
  const handleConfirm = useCallback(async () => {
    if (!selectedDestination) return;

    // Show confirmation for cross-domain moves
    if (isCrossDomain && !showCrossDomainConfirm && action === "move") {
      setShowCrossDomainConfirm(true);
      return;
    }

    try {
      await moveEmailsMutation.mutateAsync({
        emailIds,
        destination: selectedDestination,
        action,
        isCrossDomain: !!isCrossDomain,
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to move emails:", error);
    }
  }, [
    selectedDestination,
    isCrossDomain,
    showCrossDomainConfirm,
    action,
    emailIds,
    moveEmailsMutation,
    onSuccess,
    onClose,
  ]);

  // Reset state when dialog closes
  const handleClose = useCallback(() => {
    setSelectedDestination(null);
    setShowCrossDomainConfirm(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") handleClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <FolderInput className="h-5 w-5 text-neutral-500" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {action === "move" ? "Move" : "Copy"} {emailIds.length} email
              {emailIds.length !== 1 ? "s" : ""}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cross-domain warning */}
        {showCrossDomainConfirm && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-200">
                  Cross-domain move
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  You are moving emails to a different domain ({selectedDestination?.domainName}).
                  This may affect email organization and search.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Folder Tree */}
        <div className="max-h-[400px] overflow-y-auto p-4">
          {domains.map((domain: Domain) => (
            <DomainSection
              key={domain.id}
              domain={domain}
              selectedFolderId={selectedDestination?.folderId ?? null}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedDestination || moveEmailsMutation.isPending}
          >
            {moveEmailsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {action === "move" ? "Moving..." : "Copying..."}
              </>
            ) : showCrossDomainConfirm ? (
              "Confirm Move"
            ) : action === "move" ? (
              "Move"
            ) : (
              "Copy"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MoveEmailDialog;
