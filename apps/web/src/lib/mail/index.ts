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
  useScheduleDelayedSend,
  useSaveDraft,
  useDeleteDraft,
  useUploadAttachment,
} from "./compose-api";
export type { PendingEmail } from "./compose-api";

// Undo Send
export { useUndoSend, useUndoSendSettings } from "./use-undo-send";
export type { UndoSendSettings } from "./use-undo-send";

// WebSocket
export { useMailWebSocket, useMailRealtime } from "./websocket";

// Search
export {
  parseSearchQuery,
  stringifySearchQuery,
  getSearchSuggestions,
  highlightSearchTerms,
  extractSearchSnippet,
  SEARCH_OPERATORS,
} from "./search";
export type { SearchOperator, ParsedSearchQuery, SearchSuggestion } from "./search";

// Components
export {
  MailSidebar,
  EmailListItemComponent,
  EmailListItemSkeleton,
  EmailList,
  DomainFilterToolbar,
  MoveEmailDialog,
  AdvancedSearchBar,
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
