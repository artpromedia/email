// Package imap re-exports all types from the types package for backward compatibility.
// The actual type definitions live in github.com/oonrumail/imap-server/types to avoid import cycles.
package imap

import (
	"github.com/oonrumail/imap-server/types"
)

// Type aliases for backward compatibility
type NamespaceMode = types.NamespaceMode
type MailboxType = types.MailboxType
type SpecialUse = types.SpecialUse
type MessageFlag = types.MessageFlag
type Permission = types.Permission
type User = types.User
type Organization = types.Organization
type Domain = types.Domain
type Mailbox = types.Mailbox
type SharedMailboxAccess = types.SharedMailboxAccess
type Folder = types.Folder
type Message = types.Message
type Quota = types.Quota
type Namespace = types.Namespace
type NamespaceResponse = types.NamespaceResponse
type ConnectionContext = types.ConnectionContext
type FolderList = types.FolderList
type SelectResponse = types.SelectResponse
type FetchItem = types.FetchItem
type SearchKey = types.SearchKey
type CopyMoveRequest = types.CopyMoveRequest
type IdleNotification = types.IdleNotification
type AuditLog = types.AuditLog

// Re-export constants
const (
	NamespaceModeUnified         = types.NamespaceModeUnified
	NamespaceModeDomainSeparated = types.NamespaceModeDomainSeparated

	MailboxTypePersonal = types.MailboxTypePersonal
	MailboxTypeShared   = types.MailboxTypeShared
	MailboxTypeDomain   = types.MailboxTypeDomain

	SpecialUseInbox     = types.SpecialUseInbox
	SpecialUseSent      = types.SpecialUseSent
	SpecialUseDrafts    = types.SpecialUseDrafts
	SpecialUseTrash     = types.SpecialUseTrash
	SpecialUseJunk      = types.SpecialUseJunk
	SpecialUseArchive   = types.SpecialUseArchive
	SpecialUseFlagged   = types.SpecialUseFlagged
	SpecialUseAll       = types.SpecialUseAll
	SpecialUseImportant = types.SpecialUseImportant

	FlagSeen     = types.FlagSeen
	FlagAnswered = types.FlagAnswered
	FlagFlagged  = types.FlagFlagged
	FlagDeleted  = types.FlagDeleted
	FlagDraft    = types.FlagDraft
	FlagRecent   = types.FlagRecent

	PermissionRead      = types.PermissionRead
	PermissionWrite     = types.PermissionWrite
	PermissionInsert    = types.PermissionInsert
	PermissionDelete    = types.PermissionDelete
	PermissionAdmin     = types.PermissionAdmin
	PermissionReadWrite = types.PermissionReadWrite

	FetchItemAll           = types.FetchItemAll
	FetchItemFast          = types.FetchItemFast
	FetchItemFull          = types.FetchItemFull
	FetchItemEnvelope      = types.FetchItemEnvelope
	FetchItemFlags         = types.FetchItemFlags
	FetchItemInternalDate  = types.FetchItemInternalDate
	FetchItemRFC822        = types.FetchItemRFC822
	FetchItemRFC822Header  = types.FetchItemRFC822Header
	FetchItemRFC822Size    = types.FetchItemRFC822Size
	FetchItemRFC822Text    = types.FetchItemRFC822Text
	FetchItemBody          = types.FetchItemBody
	FetchItemBodyStructure = types.FetchItemBodyStructure
	FetchItemUID           = types.FetchItemUID
	FetchItemModSeq        = types.FetchItemModSeq
)
