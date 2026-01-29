package models

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

// DeduplicatedAttachment represents a deduplicated attachment stored once
type DeduplicatedAttachment struct {
	ID           string    `json:"id"`
	OrgID        string    `json:"org_id"` // Dedup is org-scoped
	ContentHash  string    `json:"content_hash"` // SHA-256 hash
	StorageKey   string    `json:"storage_key"`
	Size         int64     `json:"size"`
	ContentType  string    `json:"content_type"`
	RefCount     int       `json:"ref_count"` // Number of references
	FirstSeenAt  time.Time `json:"first_seen_at"`
	LastSeenAt   time.Time `json:"last_seen_at"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AttachmentReference represents a reference to a deduplicated attachment
type AttachmentReference struct {
	ID              string    `json:"id"`
	DedupID         string    `json:"dedup_id"` // Reference to DeduplicatedAttachment
	OrgID           string    `json:"org_id"`
	DomainID        string    `json:"domain_id"`
	UserID          string    `json:"user_id"`
	MailboxID       string    `json:"mailbox_id"`
	MessageID       string    `json:"message_id"`
	Filename        string    `json:"filename"` // User-facing filename
	ContentType     string    `json:"content_type"`
	Size            int64     `json:"size"`
	ContentID       string    `json:"content_id,omitempty"` // For inline attachments
	IsInline        bool      `json:"is_inline"`
	CreatedAt       time.Time `json:"created_at"`
}

// ComputeContentHash computes SHA-256 hash of content for deduplication
func ComputeContentHash(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// DeduplicationResult represents the result of a deduplication check
type DeduplicationResult struct {
	IsDuplicate   bool                    `json:"is_duplicate"`
	Existing      *DeduplicatedAttachment `json:"existing,omitempty"`
	ContentHash   string                  `json:"content_hash"`
	SpaceSaved    int64                   `json:"space_saved"` // Bytes saved if duplicate
}

// DeduplicationStats provides statistics about deduplication
type DeduplicationStats struct {
	OrgID              string  `json:"org_id"`
	TotalAttachments   int64   `json:"total_attachments"`
	UniqueAttachments  int64   `json:"unique_attachments"`
	DuplicateCount     int64   `json:"duplicate_count"`
	TotalStorageUsed   int64   `json:"total_storage_used"`
	StorageSaved       int64   `json:"storage_saved"`
	DeduplicationRatio float64 `json:"deduplication_ratio"` // Percentage saved
}

// CleanupCandidate represents an attachment eligible for cleanup
type CleanupCandidate struct {
	ID          string    `json:"id"`
	StorageKey  string    `json:"storage_key"`
	Size        int64     `json:"size"`
	RefCount    int       `json:"ref_count"`
	LastSeenAt  time.Time `json:"last_seen_at"`
	Reason      string    `json:"reason"` // "zero_refs", "orphaned", etc.
}

// DeduplicationConfig holds configuration for deduplication
type DeduplicationConfig struct {
	Enabled           bool          `json:"enabled"`
	MinSizeBytes      int64         `json:"min_size_bytes"`      // Min size to consider for dedup
	MaxSizeBytes      int64         `json:"max_size_bytes"`      // Max size to consider for dedup
	HashAlgorithm     string        `json:"hash_algorithm"`      // "sha256", "md5", etc.
	CleanupInterval   time.Duration `json:"cleanup_interval"`
	OrphanGracePeriod time.Duration `json:"orphan_grace_period"` // Time before cleaning orphans
}

// DefaultDeduplicationConfig returns default deduplication settings
func DefaultDeduplicationConfig() *DeduplicationConfig {
	return &DeduplicationConfig{
		Enabled:           true,
		MinSizeBytes:      1024,                    // 1KB minimum
		MaxSizeBytes:      100 * 1024 * 1024,       // 100MB maximum
		HashAlgorithm:     "sha256",
		CleanupInterval:   24 * time.Hour,
		OrphanGracePeriod: 7 * 24 * time.Hour,      // 7 days
	}
}
