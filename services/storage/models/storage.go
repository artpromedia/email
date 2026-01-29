package models

import (
	"fmt"
	"time"
)

// StorageKey represents a domain-partitioned storage key
type StorageKey struct {
	OrgID     string
	DomainID  string
	UserID    string
	Type      StorageType
	Year      int
	Month     int
	MessageID string
	// For attachments
	AttachmentID string
	// For shared mailboxes
	SharedMailboxID string
}

// StorageType represents the type of storage object
type StorageType string

const (
	StorageTypeMessage     StorageType = "messages"
	StorageTypeAttachment  StorageType = "attachments"
	StorageTypeShared      StorageType = "shared"
	StorageTypeExport      StorageType = "exports"
	StorageTypeArchive     StorageType = "archive"
)

// String returns the full storage key path
func (k *StorageKey) String() string {
	switch k.Type {
	case StorageTypeMessage:
		return fmt.Sprintf("%s/%s/%s/messages/%d/%02d/%s",
			k.OrgID, k.DomainID, k.UserID, k.Year, k.Month, k.MessageID)
	case StorageTypeAttachment:
		return fmt.Sprintf("%s/%s/%s/attachments/%s",
			k.OrgID, k.DomainID, k.UserID, k.AttachmentID)
	case StorageTypeShared:
		return fmt.Sprintf("%s/%s/shared/%s/messages/%d/%02d/%s",
			k.OrgID, k.DomainID, k.SharedMailboxID, k.Year, k.Month, k.MessageID)
	case StorageTypeExport:
		return fmt.Sprintf("%s/%s/exports/%s",
			k.OrgID, k.DomainID, k.MessageID)
	case StorageTypeArchive:
		return fmt.Sprintf("%s/%s/%s/archive/%d/%02d/%s",
			k.OrgID, k.DomainID, k.UserID, k.Year, k.Month, k.MessageID)
	default:
		return fmt.Sprintf("%s/%s/%s/%s",
			k.OrgID, k.DomainID, k.UserID, k.MessageID)
	}
}

// DomainPrefix returns the prefix for listing all objects in a domain
func (k *StorageKey) DomainPrefix() string {
	return fmt.Sprintf("%s/%s/", k.OrgID, k.DomainID)
}

// UserPrefix returns the prefix for listing all objects for a user
func (k *StorageKey) UserPrefix() string {
	return fmt.Sprintf("%s/%s/%s/", k.OrgID, k.DomainID, k.UserID)
}

// NewMessageKey creates a storage key for a message
func NewMessageKey(orgID, domainID, userID, messageID string, timestamp time.Time) *StorageKey {
	return &StorageKey{
		OrgID:     orgID,
		DomainID:  domainID,
		UserID:    userID,
		Type:      StorageTypeMessage,
		Year:      timestamp.Year(),
		Month:     int(timestamp.Month()),
		MessageID: messageID,
	}
}

// NewAttachmentKey creates a storage key for an attachment
func NewAttachmentKey(orgID, domainID, userID, attachmentID string) *StorageKey {
	return &StorageKey{
		OrgID:        orgID,
		DomainID:     domainID,
		UserID:       userID,
		Type:         StorageTypeAttachment,
		AttachmentID: attachmentID,
	}
}

// NewSharedMailboxKey creates a storage key for a shared mailbox message
func NewSharedMailboxKey(orgID, domainID, sharedMailboxID, messageID string, timestamp time.Time) *StorageKey {
	return &StorageKey{
		OrgID:           orgID,
		DomainID:        domainID,
		Type:            StorageTypeShared,
		SharedMailboxID: sharedMailboxID,
		Year:            timestamp.Year(),
		Month:           int(timestamp.Month()),
		MessageID:       messageID,
	}
}

// StorageObject represents a stored object with metadata
type StorageObject struct {
	Key          string            `json:"key"`
	Size         int64             `json:"size"`
	ContentType  string            `json:"content_type"`
	ETag         string            `json:"etag"`
	LastModified time.Time         `json:"last_modified"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// MessageMetadata contains metadata for stored email messages
type MessageMetadata struct {
	OrgID       string    `json:"org_id"`
	DomainID    string    `json:"domain_id"`
	UserID      string    `json:"user_id"`
	MailboxID   string    `json:"mailbox_id"`
	FolderID    string    `json:"folder_id"`
	MessageID   string    `json:"message_id"`
	Subject     string    `json:"subject"`
	From        string    `json:"from"`
	To          []string  `json:"to"`
	Date        time.Time `json:"date"`
	Size        int64     `json:"size"`
	HasAttachments bool   `json:"has_attachments"`
	Flags       []string  `json:"flags"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AttachmentMetadata contains metadata for stored attachments
type AttachmentMetadata struct {
	AttachmentID string    `json:"attachment_id"`
	MessageID    string    `json:"message_id"`
	OrgID        string    `json:"org_id"`
	DomainID     string    `json:"domain_id"`
	UserID       string    `json:"user_id"`
	Filename     string    `json:"filename"`
	ContentType  string    `json:"content_type"`
	Size         int64     `json:"size"`
	ContentHash  string    `json:"content_hash"` // SHA-256 for deduplication
	RefCount     int       `json:"ref_count"`    // Reference count for dedup
	CreatedAt    time.Time `json:"created_at"`
}

// UploadRequest represents a request to upload a file
type UploadRequest struct {
	OrgID        string            `json:"org_id"`
	DomainID     string            `json:"domain_id"`
	UserID       string            `json:"user_id"`
	MailboxID    string            `json:"mailbox_id"`
	Type         StorageType       `json:"type"`
	ContentType  string            `json:"content_type"`
	Size         int64             `json:"size"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	ContentHash  string            `json:"content_hash,omitempty"` // For dedup check
}

// UploadResponse contains the result of an upload operation
type UploadResponse struct {
	Key         string `json:"key"`
	UploadURL   string `json:"upload_url,omitempty"`   // For presigned uploads
	UploadID    string `json:"upload_id,omitempty"`    // For multipart uploads
	Deduplicated bool  `json:"deduplicated,omitempty"` // If attachment was deduped
	ExistingKey string `json:"existing_key,omitempty"` // Key of deduped attachment
}

// DownloadRequest represents a request to download a file
type DownloadRequest struct {
	OrgID    string `json:"org_id"`
	DomainID string `json:"domain_id"`
	Key      string `json:"key"`
}

// DownloadResponse contains the result of a download operation
type DownloadResponse struct {
	URL         string    `json:"url"`
	ContentType string    `json:"content_type"`
	Size        int64     `json:"size"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// ListRequest represents a request to list objects
type ListRequest struct {
	OrgID      string `json:"org_id"`
	DomainID   string `json:"domain_id"`
	UserID     string `json:"user_id,omitempty"`
	Prefix     string `json:"prefix,omitempty"`
	MaxKeys    int    `json:"max_keys,omitempty"`
	StartAfter string `json:"start_after,omitempty"`
}

// ListResponse contains the result of a list operation
type ListResponse struct {
	Objects     []*StorageObject `json:"objects"`
	IsTruncated bool             `json:"is_truncated"`
	NextMarker  string           `json:"next_marker,omitempty"`
}

// CopyRequest represents a request to copy an object
type CopyRequest struct {
	SourceOrgID      string `json:"source_org_id"`
	SourceDomainID   string `json:"source_domain_id"`
	SourceKey        string `json:"source_key"`
	DestOrgID        string `json:"dest_org_id"`
	DestDomainID     string `json:"dest_domain_id"`
	DestUserID       string `json:"dest_user_id"`
	DestMailboxID    string `json:"dest_mailbox_id"`
	UpdateRetention  bool   `json:"update_retention"` // Apply dest domain's retention
}

// MoveRequest represents a request to move an object (copy + delete)
type MoveRequest struct {
	CopyRequest
	DeleteSource bool `json:"delete_source"`
}
