package types

import (
	"time"
)

// NamespaceMode defines how folders are displayed
type NamespaceMode string

const (
	NamespaceModeUnified         NamespaceMode = "unified"
	NamespaceModeDomainSeparated NamespaceMode = "domain_separated"
)

// MailboxType defines the type of mailbox
type MailboxType string

const (
	MailboxTypePersonal MailboxType = "personal"
	MailboxTypeShared   MailboxType = "shared"
	MailboxTypeDomain   MailboxType = "domain"
)

// SpecialUse defines special-use folder attributes
type SpecialUse string

const (
	SpecialUseInbox     SpecialUse = "\\Inbox"
	SpecialUseSent      SpecialUse = "\\Sent"
	SpecialUseDrafts    SpecialUse = "\\Drafts"
	SpecialUseTrash     SpecialUse = "\\Trash"
	SpecialUseJunk      SpecialUse = "\\Junk"
	SpecialUseArchive   SpecialUse = "\\Archive"
	SpecialUseFlagged   SpecialUse = "\\Flagged"
	SpecialUseAll       SpecialUse = "\\All"
	SpecialUseImportant SpecialUse = "\\Important"
)

// MessageFlag represents IMAP message flags
type MessageFlag string

const (
	FlagSeen     MessageFlag = "\\Seen"
	FlagAnswered MessageFlag = "\\Answered"
	FlagFlagged  MessageFlag = "\\Flagged"
	FlagDeleted  MessageFlag = "\\Deleted"
	FlagDraft    MessageFlag = "\\Draft"
	FlagRecent   MessageFlag = "\\Recent"
)

// Permission defines mailbox access permissions
type Permission string

const (
	PermissionRead      Permission = "read"
	PermissionWrite     Permission = "write"
	PermissionInsert    Permission = "insert"
	PermissionDelete    Permission = "delete"
	PermissionAdmin     Permission = "admin"
	PermissionReadWrite Permission = "read-write"
)

// User represents an authenticated user
type User struct {
	ID               string     `json:"id"`
	OrganizationID   string     `json:"organization_id"`
	OrganizationRole string     `json:"organization_role"` // admin, member, etc
	Email            string     `json:"email"`             // Primary email
	Emails           []string   `json:"emails"`            // All email addresses
	DisplayName      string     `json:"display_name"`
	PasswordHash     string     `json:"-"`
	IsActive         bool       `json:"is_active"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	LastLoginAt      *time.Time `json:"last_login_at"`
}

// Organization represents an organization/tenant
type Organization struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

// Domain represents an email domain
type Domain struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	Name           string    `json:"name"` // e.g., "example.com"
	DisplayName    string    `json:"display_name"`
	IsPrimary      bool      `json:"is_primary"`
	IsVerified     bool      `json:"is_verified"`
	CreatedAt      time.Time `json:"created_at"`
}

// Mailbox represents a user's mailbox on a domain
type Mailbox struct {
	ID            string        `json:"id"`
	UserID        string        `json:"user_id"`
	DomainID      string        `json:"domain_id"`
	Domain        *Domain       `json:"domain,omitempty"`
	Email         string        `json:"email"`
	DisplayName   string        `json:"display_name"`
	QuotaBytes    int64         `json:"quota_bytes"`
	StorageUsed   int64         `json:"storage_used"`
	MessageCount  int           `json:"message_count"`
	UnreadCount   int           `json:"unread_count"`
	IsPrimary     bool          `json:"is_primary"`
	IsShared      bool          `json:"is_shared"`
	NamespaceMode NamespaceMode `json:"namespace_mode"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// SharedMailboxAccess represents access to a shared mailbox
type SharedMailboxAccess struct {
	ID          string       `json:"id"`
	MailboxID   string       `json:"mailbox_id"`
	UserID      string       `json:"user_id"`
	Permissions []Permission `json:"permissions"`
	GrantedBy   string       `json:"granted_by"`
	GrantedAt   time.Time    `json:"granted_at"`
	ExpiresAt   *time.Time   `json:"expires_at,omitempty"`
}

// Folder represents an IMAP folder within a mailbox
type Folder struct {
	ID            string      `json:"id"`
	MailboxID     string      `json:"mailbox_id"`
	Name          string      `json:"name"`      // Folder name (e.g., "INBOX", "Sent")
	FullPath      string      `json:"full_path"` // Full IMAP path
	ParentID      *string     `json:"parent_id"`
	SpecialUse    *SpecialUse `json:"special_use"`
	Attributes    []string    `json:"attributes"`
	Delimiter     string      `json:"delimiter"`
	UIDValidity   uint32      `json:"uid_validity"`
	UIDNext       uint32      `json:"uid_next"`
	HighestModSeq uint64      `json:"highest_modseq"`
	MessageCount  int         `json:"message_count"`
	RecentCount   int         `json:"recent_count"`
	UnseenCount   int         `json:"unseen_count"`
	FirstUnseen   uint32      `json:"first_unseen"`
	Subscribed    bool        `json:"subscribed"`
	Selectable    bool        `json:"selectable"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
}

// Message represents an email message
type Message struct {
	ID            string        `json:"id"`
	FolderID      string        `json:"folder_id"`
	MailboxID     string        `json:"mailbox_id"`
	UID           uint32        `json:"uid"`
	SequenceNum   uint32        `json:"sequence_num"`
	MessageID     string        `json:"message_id"`
	InReplyTo     string        `json:"in_reply_to"`
	References    []string      `json:"references"` // RFC 5322 References header for threading
	Subject       string        `json:"subject"`
	From          string        `json:"from"`
	To            []string      `json:"to"`
	Cc            []string      `json:"cc"`
	Bcc           []string      `json:"bcc"`
	ReplyTo       string        `json:"reply_to"`
	Date          time.Time     `json:"date"`
	Size          int64         `json:"size"`
	Flags         []MessageFlag `json:"flags"`
	ModSeq        uint64        `json:"modseq"`
	BodyPath      string        `json:"body_path"` // Path to message body in storage
	HeadersJSON   string        `json:"headers_json"`
	BodyStructure string        `json:"body_structure"` // BODYSTRUCTURE cache
	Envelope      string        `json:"envelope"`       // ENVELOPE cache
	ReceivedAt    time.Time     `json:"received_at"`    // IMAP INTERNALDATE
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// Quota represents mailbox quota information
// Quota represents mailbox quota information
type Quota struct {
	MailboxID     string `json:"mailbox_id"`
	DomainName    string `json:"domain_name"`
	ResourceName  string `json:"resource_name"` // STORAGE, MESSAGE
	Usage         int64  `json:"usage"`
	Limit         int64  `json:"limit"`
	StorageUsed   int64  `json:"storage_used"`  // Legacy: bytes used
	StorageLimit  int64  `json:"storage_limit"` // Legacy: bytes limit
	MessageCount  int64  `json:"message_count"`
	MessageLimit  int64  `json:"message_limit"`
}

// Namespace represents an IMAP namespace
type Namespace struct {
	Prefix    string `json:"prefix"`
	Delimiter string `json:"delimiter"`
}

// NamespaceResponse represents the NAMESPACE command response
type NamespaceResponse struct {
	Personal []Namespace `json:"personal"`
	Other    []Namespace `json:"other"`
	Shared   []Namespace `json:"shared"`
}

// ConnectionContext holds the state for an IMAP connection
type ConnectionContext struct {
	ID               string        `json:"id"`
	User             *User         `json:"user"`
	Organization     *Organization `json:"organization"`
	Mailboxes        []*Mailbox    `json:"mailboxes"`        // All accessible mailboxes
	SharedMailboxes  []*Mailbox    `json:"shared_mailboxes"` // Shared mailbox access
	ActiveMailbox    *Mailbox      `json:"active_mailbox"`   // Currently selected mailbox
	ActiveFolder     *Folder       `json:"active_folder"`    // Currently selected folder
	DomainContext    *Domain       `json:"domain_context"`   // Current domain context
	NamespaceMode    NamespaceMode `json:"namespace_mode"`
	Capabilities     []string      `json:"capabilities"`
	Authenticated    bool          `json:"authenticated"`
	TLSEnabled       bool          `json:"tls_enabled"`
	ReadOnly         bool          `json:"read_only"` // EXAMINE vs SELECT
	IdleActive       bool          `json:"idle_active"`
	CompressionOn    bool          `json:"compression_on"`
	QRESYNCEnabled   bool          `json:"qresync_enabled"`   // QRESYNC extension enabled
	CONDSTOREEnabled bool          `json:"condstore_enabled"` // CONDSTORE extension enabled
	ClientAddr       string        `json:"client_addr"`
	ConnectedAt      time.Time     `json:"connected_at"`
	LastActivityAt   time.Time     `json:"last_activity_at"`
}

// FolderList represents a folder in LIST response
type FolderList struct {
	Name       string      `json:"name"`
	Delimiter  string      `json:"delimiter"`
	Attributes []string    `json:"attributes"`
	SpecialUse *SpecialUse `json:"special_use,omitempty"`
	Subscribed bool        `json:"subscribed"`
}

// SelectResponse represents the response to a SELECT/EXAMINE command
type SelectResponse struct {
	Flags          []MessageFlag `json:"flags"`
	PermanentFlags []MessageFlag `json:"permanent_flags"`
	Exists         int           `json:"exists"`
	Recent         int           `json:"recent"`
	Unseen         int           `json:"unseen"`
	FirstUnseen    uint32        `json:"first_unseen"`
	UIDValidity    uint32        `json:"uid_validity"`
	UIDNext        uint32        `json:"uid_next"`
	HighestModSeq  uint64        `json:"highest_modseq"`
	ReadOnly       bool          `json:"read_only"`
}

// FetchItem represents what to fetch for a message
type FetchItem string

const (
	FetchItemAll           FetchItem = "ALL"
	FetchItemFast          FetchItem = "FAST"
	FetchItemFull          FetchItem = "FULL"
	FetchItemEnvelope      FetchItem = "ENVELOPE"
	FetchItemFlags         FetchItem = "FLAGS"
	FetchItemInternalDate  FetchItem = "INTERNALDATE"
	FetchItemRFC822        FetchItem = "RFC822"
	FetchItemRFC822Header  FetchItem = "RFC822.HEADER"
	FetchItemRFC822Size    FetchItem = "RFC822.SIZE"
	FetchItemRFC822Text    FetchItem = "RFC822.TEXT"
	FetchItemBody          FetchItem = "BODY"
	FetchItemBodyStructure FetchItem = "BODYSTRUCTURE"
	FetchItemUID           FetchItem = "UID"
	FetchItemModSeq        FetchItem = "MODSEQ"
)

// SearchKey represents IMAP search criteria
type SearchKey struct {
	Key      string      `json:"key"`
	Value    interface{} `json:"value,omitempty"`
	Not      bool        `json:"not,omitempty"`
	Children []SearchKey `json:"children,omitempty"`
}

// CopyMoveRequest represents a COPY or MOVE request
type CopyMoveRequest struct {
	SourceFolder string   `json:"source_folder"`
	DestFolder   string   `json:"dest_folder"`
	UIDs         []uint32 `json:"uids"`
	IsMove       bool     `json:"is_move"`
}

// IdleNotification represents a notification during IDLE
type IdleNotification struct {
	Type       string        `json:"type"` // EXISTS, EXPUNGE, FLAGS
	MailboxID  string        `json:"mailbox_id"`
	FolderPath string        `json:"folder_path"`
	UID        uint32        `json:"uid,omitempty"`
	SeqNum     uint32        `json:"seq_num,omitempty"`
	Flags      []MessageFlag `json:"flags,omitempty"`
	Timestamp  time.Time     `json:"timestamp"`
}

// AuditLog represents an access audit entry
type AuditLog struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	MailboxID   string    `json:"mailbox_id"`
	Action      string    `json:"action"` // read, write, delete, copy, move
	FolderPath  string    `json:"folder_path"`
	MessageUIDs []uint32  `json:"message_uids,omitempty"`
	Details     string    `json:"details,omitempty"`
	ClientAddr  string    `json:"client_addr"`
	Timestamp   time.Time `json:"timestamp"`
}
