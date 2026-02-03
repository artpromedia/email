"use client";

/**
 * Drag and Drop Email System
 * Enables dragging emails to folders for organization
 *
 * Features:
 * - Drag emails from list to sidebar folders
 * - Multi-select drag support
 * - Visual feedback during drag
 * - Drop zone highlighting
 */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type DragEvent,
} from "react";
import { Mail } from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

export interface DragItem {
  type: "email" | "emails";
  emailIds: string[];
  subjects: string[];
}

export interface DropTarget {
  type: "folder" | "label";
  id: string;
  name: string;
}

interface DragDropContextValue {
  dragItem: DragItem | null;
  isDragging: boolean;
  activeDropTarget: string | null;
  startDrag: (item: DragItem) => void;
  endDrag: () => void;
  setActiveDropTarget: (targetId: string | null) => void;
  handleDrop: (target: DropTarget) => void;
  onEmailMove?: (emailIds: string[], targetFolderId: string) => void;
  onEmailLabel?: (emailIds: string[], labelId: string) => void;
}

// ============================================================
// CONTEXT
// ============================================================

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDrop must be used within DragDropProvider");
  }
  return context;
}

// ============================================================
// PROVIDER
// ============================================================

interface DragDropProviderProps {
  children: ReactNode;
  onEmailMove?: (emailIds: string[], targetFolderId: string) => void;
  onEmailLabel?: (emailIds: string[], labelId: string) => void;
}

export function DragDropProvider({ children, onEmailMove, onEmailLabel }: DragDropProviderProps) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);

  const startDrag = useCallback((item: DragItem) => {
    setDragItem(item);
  }, []);

  const endDrag = useCallback(() => {
    setDragItem(null);
    setActiveDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (target: DropTarget) => {
      if (!dragItem) return;

      if (target.type === "folder") {
        onEmailMove?.(dragItem.emailIds, target.id);
      } else {
        onEmailLabel?.(dragItem.emailIds, target.id);
      }

      endDrag();
    },
    [dragItem, onEmailMove, onEmailLabel, endDrag]
  );

  return (
    <DragDropContext.Provider
      value={{
        dragItem,
        isDragging: !!dragItem,
        activeDropTarget,
        startDrag,
        endDrag,
        setActiveDropTarget,
        handleDrop,
        onEmailMove,
        onEmailLabel,
      }}
    >
      {children}
    </DragDropContext.Provider>
  );
}

// ============================================================
// DRAGGABLE EMAIL WRAPPER
// ============================================================

interface DraggableEmailProps {
  children: ReactNode;
  emailId: string;
  subject: string;
  isSelected?: boolean;
  selectedEmailIds?: string[];
  selectedSubjects?: string[];
  className?: string;
}

export function DraggableEmail({
  children,
  emailId,
  subject,
  isSelected = false,
  selectedEmailIds = [],
  selectedSubjects = [],
  className,
}: DraggableEmailProps) {
  const { startDrag, endDrag, isDragging } = useDragDrop();
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // Determine what to drag - selected items or just this one
      const ids = isSelected && selectedEmailIds.length > 0 ? selectedEmailIds : [emailId];
      const subjects = isSelected && selectedSubjects.length > 0 ? selectedSubjects : [subject];

      // Set drag data
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          type: ids.length > 1 ? "emails" : "email",
          emailIds: ids,
          subjects,
        })
      );
      e.dataTransfer.effectAllowed = "move";

      // Create custom drag image
      const ghost = document.createElement("div");
      ghost.className =
        "fixed pointer-events-none z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium";
      ghost.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        <span>${ids.length > 1 ? `${ids.length} emails` : "1 email"}</span>
      `;
      ghost.style.left = "-1000px";
      ghost.style.top = "-1000px";
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      e.dataTransfer.setDragImage(ghost, 20, 20);

      startDrag({
        type: ids.length > 1 ? "emails" : "email",
        emailIds: ids,
        subjects,
      });
    },
    [emailId, subject, isSelected, selectedEmailIds, selectedSubjects, startDrag]
  );

  const handleDragEnd = useCallback(() => {
    // Clean up ghost element
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    endDrag();
  }, [endDrag]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-50", className)}
    >
      {children}
    </div>
  );
}

// ============================================================
// DROP TARGET WRAPPER
// ============================================================

interface DroppableFolderProps {
  children: ReactNode;
  folderId: string;
  folderName: string;
  type?: "folder" | "label";
  className?: string;
  activeClassName?: string;
}

export function DroppableFolder({
  children,
  folderId,
  folderName,
  type = "folder",
  className,
  activeClassName = "bg-primary/10 ring-2 ring-primary",
}: DroppableFolderProps) {
  const { isDragging, activeDropTarget, setActiveDropTarget, handleDrop } = useDragDrop();
  const isActive = activeDropTarget === folderId;

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setActiveDropTarget(folderId);
    },
    [folderId, setActiveDropTarget]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // Only clear if leaving the element entirely
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setActiveDropTarget(null);
      }
    },
    [setActiveDropTarget]
  );

  const handleDropEvent = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleDrop({ type, id: folderId, name: folderName });
    },
    [type, folderId, folderName, handleDrop]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
      className={cn(
        "transition-all duration-150",
        isDragging && "ring-dashed ring-1 ring-muted-foreground/30",
        isActive && activeClassName,
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// DRAG OVERLAY (for visual feedback)
// ============================================================

export function DragOverlay() {
  const { dragItem, isDragging } = useDragDrop();

  if (!isDragging || !dragItem) return null;

  const count = dragItem.emailIds.length;
  const preview = dragItem.subjects[0];
  const moreCount = count - 1;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-xl">
        <Mail className="h-5 w-5" />
        <div className="text-sm">
          <div className="font-medium">
            Moving {count} {count === 1 ? "email" : "emails"}
          </div>
          {preview && (
            <div className="max-w-[200px] truncate text-xs opacity-80">
              {preview}
              {moreCount > 0 && ` +${moreCount} more`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// UTILITY HOOK FOR KEYBOARD DRAG
// ============================================================

export function useKeyboardDrag(emailId: string) {
  const { onEmailMove } = useDragDrop();
  const [isMoving, setIsMoving] = useState(false);

  const startKeyboardMove = useCallback(() => {
    setIsMoving(true);
  }, []);

  const cancelKeyboardMove = useCallback(() => {
    setIsMoving(false);
  }, []);

  const moveToFolder = useCallback(
    (folderId: string) => {
      if (onEmailMove) {
        onEmailMove([emailId], folderId);
      }
      setIsMoving(false);
    },
    [emailId, onEmailMove]
  );

  // Listen for Escape to cancel
  useEffect(() => {
    if (!isMoving) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelKeyboardMove();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoving, cancelKeyboardMove]);

  return {
    isMoving,
    startKeyboardMove,
    cancelKeyboardMove,
    moveToFolder,
  };
}

export default DragDropProvider;
