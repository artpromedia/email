/**
 * Mail Components Index
 * Re-exports all mail-related components
 */

export { MailSidebar } from "./MailSidebar";
export { EmailListItemComponent, EmailListItemSkeleton } from "./EmailListItem";
export type { EmailListItemProps } from "./EmailListItem";
export { EmailList } from "./EmailList";
export { EmailThreadGroup } from "./EmailThreadGroup";
export { DomainFilterToolbar } from "./DomainFilterToolbar";
export { MoveEmailDialog } from "./MoveEmailDialog";
export { AdvancedSearchBar } from "./AdvancedSearchBar";

// Mobile & interaction components
export { SwipeableEmailItem, useIsTouchDevice } from "./SwipeableEmailItem";
export {
  DragDropProvider,
  DraggableEmail,
  DroppableFolder,
  DragOverlay,
  useDragDrop,
  useKeyboardDrag,
} from "./DragDropEmail";
export { PullToRefresh, usePullToRefresh } from "./PullToRefresh";
export { EmailSnooze, useEmailSnooze } from "./EmailSnooze";
export type { SnoozedEmail, SnoozeOption } from "./EmailSnooze";

// Compose components
export {
  FromAddressSelector,
  FromAddressBadge,
  RecipientInput,
  InternalBadge,
  ComposeHeader,
  ComposeHeaderCompact,
  EmailCompose,
  ContactPicker,
  EmailTemplateManager,
  SAMPLE_TEMPLATES,
} from "./compose";
export type { EmailTemplate, TemplateVariable } from "./compose";
