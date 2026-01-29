/**
 * Mail Components Index
 * Re-exports all mail-related components
 */

export { MailSidebar } from "./MailSidebar";
export { EmailListItemComponent, EmailListItemSkeleton } from "./EmailListItem";
export type { EmailListItemProps } from "./EmailListItem";
export { EmailList } from "./EmailList";
export { DomainFilterToolbar } from "./DomainFilterToolbar";
export { MoveEmailDialog } from "./MoveEmailDialog";

// Compose components
export {
  FromAddressSelector,
  FromAddressBadge,
  RecipientInput,
  InternalBadge,
  ComposeHeader,
  ComposeHeaderCompact,
  EmailCompose,
} from "./compose";
