package models

import (
	"time"
)

// RetentionAction defines what happens when retention expires
type RetentionAction string

const (
	RetentionActionDelete  RetentionAction = "delete"
	RetentionActionArchive RetentionAction = "archive"
)

// FolderType represents types of email folders for retention
type FolderType string

const (
	FolderTypeAll     FolderType = "all"
	FolderTypeInbox   FolderType = "inbox"
	FolderTypeSent    FolderType = "sent"
	FolderTypeDrafts  FolderType = "drafts"
	FolderTypeTrash   FolderType = "trash"
	FolderTypeSpam    FolderType = "spam"
	FolderTypeArchive FolderType = "archive"
	FolderTypeCustom  FolderType = "custom"
)

// RetentionPolicy represents a domain-level retention policy
type RetentionPolicy struct {
	ID             string          `json:"id"`
	DomainID       string          `json:"domain_id"`
	FolderType     FolderType      `json:"folder_type"`
	FolderID       string          `json:"folder_id,omitempty"` // For custom folders
	RetentionDays  int             `json:"retention_days"`
	Action         RetentionAction `json:"action"`
	Enabled        bool            `json:"enabled"`
	Priority       int             `json:"priority"` // Higher = more specific
	ExcludeStarred bool            `json:"exclude_starred"`
	ExcludeLabels  []string        `json:"exclude_labels,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// RetentionPolicyMatch checks if a message matches this retention policy
type RetentionPolicyMatch struct {
	Policy        *RetentionPolicy `json:"policy"`
	MatchedAt     time.Time        `json:"matched_at"`
	ExpiresAt     time.Time        `json:"expires_at"`
	Action        RetentionAction  `json:"action"`
}

// RetentionJob represents a background retention processing job
type RetentionJob struct {
	ID            string           `json:"id"`
	DomainID      string           `json:"domain_id"`
	PolicyID      string           `json:"policy_id"`
	Status        RetentionJobStatus `json:"status"`
	StartedAt     time.Time        `json:"started_at"`
	CompletedAt   *time.Time       `json:"completed_at,omitempty"`
	ProcessedCount int64           `json:"processed_count"`
	DeletedCount  int64            `json:"deleted_count"`
	ArchivedCount int64            `json:"archived_count"`
	FailedCount   int64            `json:"failed_count"`
	ErrorMessage  string           `json:"error_message,omitempty"`
	LastProcessedKey string        `json:"last_processed_key,omitempty"` // For resumption
}

// RetentionJobStatus represents the status of a retention job
type RetentionJobStatus string

const (
	RetentionJobStatusPending    RetentionJobStatus = "pending"
	RetentionJobStatusRunning    RetentionJobStatus = "running"
	RetentionJobStatusCompleted  RetentionJobStatus = "completed"
	RetentionJobStatusFailed     RetentionJobStatus = "failed"
	RetentionJobStatusCancelled  RetentionJobStatus = "cancelled"
)

// CreateRetentionPolicyRequest represents a request to create a retention policy
type CreateRetentionPolicyRequest struct {
	DomainID       string          `json:"domain_id"`
	FolderType     FolderType      `json:"folder_type"`
	FolderID       string          `json:"folder_id,omitempty"`
	RetentionDays  int             `json:"retention_days"`
	Action         RetentionAction `json:"action"`
	Enabled        bool            `json:"enabled"`
	Priority       int             `json:"priority,omitempty"`
	ExcludeStarred bool            `json:"exclude_starred,omitempty"`
	ExcludeLabels  []string        `json:"exclude_labels,omitempty"`
}

// UpdateRetentionPolicyRequest represents a request to update a retention policy
type UpdateRetentionPolicyRequest struct {
	RetentionDays  *int             `json:"retention_days,omitempty"`
	Action         *RetentionAction `json:"action,omitempty"`
	Enabled        *bool            `json:"enabled,omitempty"`
	Priority       *int             `json:"priority,omitempty"`
	ExcludeStarred *bool            `json:"exclude_starred,omitempty"`
	ExcludeLabels  []string         `json:"exclude_labels,omitempty"`
}

// RetentionCandidate represents a message eligible for retention action
type RetentionCandidate struct {
	MessageID     string          `json:"message_id"`
	StorageKey    string          `json:"storage_key"`
	OrgID         string          `json:"org_id"`
	DomainID      string          `json:"domain_id"`
	UserID        string          `json:"user_id"`
	MailboxID     string          `json:"mailbox_id"`
	FolderID      string          `json:"folder_id"`
	FolderType    FolderType      `json:"folder_type"`
	MessageDate   time.Time       `json:"message_date"`
	Size          int64           `json:"size"`
	IsStarred     bool            `json:"is_starred"`
	Labels        []string        `json:"labels,omitempty"`
	Policy        *RetentionPolicy `json:"policy"`
	Action        RetentionAction `json:"action"`
	ExpiresAt     time.Time       `json:"expires_at"`
}

// RetentionResult represents the result of applying retention to a message
type RetentionResult struct {
	MessageID     string          `json:"message_id"`
	Action        RetentionAction `json:"action"`
	Success       bool            `json:"success"`
	Error         string          `json:"error,omitempty"`
	NewStorageKey string          `json:"new_storage_key,omitempty"` // If archived
	ProcessedAt   time.Time       `json:"processed_at"`
}

// RetentionSummary provides a summary of retention processing
type RetentionSummary struct {
	DomainID      string           `json:"domain_id"`
	TotalMessages int64            `json:"total_messages"`
	Processed     int64            `json:"processed"`
	Deleted       int64            `json:"deleted"`
	Archived      int64            `json:"archived"`
	Skipped       int64            `json:"skipped"`
	Failed        int64            `json:"failed"`
	BytesReclaimed int64           `json:"bytes_reclaimed"`
	Duration      time.Duration    `json:"duration"`
}

// LegalHold represents a legal hold that overrides retention policies
type LegalHold struct {
	ID            string    `json:"id"`
	OrgID         string    `json:"org_id"`
	DomainID      string    `json:"domain_id,omitempty"` // Optional: domain-wide hold
	UserID        string    `json:"user_id,omitempty"`   // Optional: user-specific hold
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	StartDate     time.Time `json:"start_date"`
	EndDate       *time.Time `json:"end_date,omitempty"` // Null = indefinite
	Keywords      []string  `json:"keywords,omitempty"`  // Search keywords to match
	Active        bool      `json:"active"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// IsMessageUnderHold checks if a message falls under this legal hold
func (h *LegalHold) IsMessageUnderHold(domainID, userID string, messageDate time.Time) bool {
	if !h.Active {
		return false
	}
	
	// Check date range
	if messageDate.Before(h.StartDate) {
		return false
	}
	if h.EndDate != nil && messageDate.After(*h.EndDate) {
		return false
	}
	
	// Check domain/user scope
	if h.DomainID != "" && h.DomainID != domainID {
		return false
	}
	if h.UserID != "" && h.UserID != userID {
		return false
	}
	
	return true
}
