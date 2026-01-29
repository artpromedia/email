/**
 * Mail Library Exports
 */

// Types
export * from "./types";

// Store
export {
  useMailStore,
  selectUnreadCount,
  selectActiveDomainData,
  selectFolders,
  selectSelectedEmailCount,
  selectIsAllSelected,
  selectHasSelection,
} from "./store";

// API Hooks
export {
  mailKeys,
  useDomains,
  useDomain,
  useEmails,
  useInfiniteEmails,
  useEmail,
  useMarkAsRead,
  useMarkAsUnread,
  useStarEmails,
  useUnstarEmails,
  useMoveEmails,
  useDeleteEmails,
  usePermanentlyDeleteEmails,
  useUnreadCounts,
  useFolderTree,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
} from "./api";

// WebSocket
export { useMailWebSocket, useMailRealtime } from "./websocket";

// Components
export {
  MailSidebar,
  EmailListItemComponent,
  EmailListItemSkeleton,
  EmailList,
  DomainFilterToolbar,
  MoveEmailDialog,
} from "@/components/mail";
export type { EmailListItemProps } from "@/components/mail";
