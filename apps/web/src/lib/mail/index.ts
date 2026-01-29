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

// Compose Store
export {
  useComposeStore,
  selectActiveDraft,
  selectDraftCount,
  selectPersonalAddresses,
  selectSharedAddresses,
  selectAddressesByDomain,
} from "./compose-store";

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

// Compose API Hooks
export {
  composeKeys,
  useSendableAddresses,
  useDefaultFromAddress,
  useSignatures,
  useSignatureForAddress,
  useDomainBranding,
  useValidateSendPermission,
  useCheckSendPermission,
  useRecipientHints,
  useCheckRecipientInternal,
  useSendEmail,
  useSaveDraft,
  useDeleteDraft,
  useUploadAttachment,
} from "./compose-api";

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

// Compose Components
export {
  FromAddressSelector,
  FromAddressBadge,
  RecipientInput,
  InternalBadge,
  ComposeHeader,
  ComposeHeaderCompact,
  EmailCompose,
} from "@/components/mail/compose";
