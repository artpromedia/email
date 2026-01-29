package models

import (
	"time"
)

// ExportFormat represents the format for data export
type ExportFormat string

const (
	ExportFormatMbox ExportFormat = "mbox"
	ExportFormatPST  ExportFormat = "pst"
	ExportFormatEML  ExportFormat = "eml"
	ExportFormatJSON ExportFormat = "json"
)

// ExportStatus represents the status of an export job
type ExportStatus string

const (
	ExportStatusPending    ExportStatus = "pending"
	ExportStatusRunning    ExportStatus = "running"
	ExportStatusCompleted  ExportStatus = "completed"
	ExportStatusFailed     ExportStatus = "failed"
	ExportStatusCancelled  ExportStatus = "cancelled"
	ExportStatusExpired    ExportStatus = "expired"
)

// ExportJob represents a domain data export job
type ExportJob struct {
	ID                 string        `json:"id"`
	OrgID              string        `json:"org_id"`
	DomainID           string        `json:"domain_id"`
	UserID             string        `json:"user_id,omitempty"` // Optional: export specific user
	Format             ExportFormat  `json:"format"`
	IncludeAttachments bool          `json:"include_attachments"`
	DateRange          *DateRange    `json:"date_range,omitempty"`
	FolderTypes        []FolderType  `json:"folder_types,omitempty"` // Empty = all
	Status             ExportStatus  `json:"status"`
	Progress           float64       `json:"progress"` // 0-100
	TotalMessages      int64         `json:"total_messages"`
	ProcessedMessages  int64         `json:"processed_messages"`
	TotalSize          int64         `json:"total_size"`
	ProcessedSize      int64         `json:"processed_size"`
	OutputKey          string        `json:"output_key,omitempty"`  // S3 key of output file
	DownloadURL        string        `json:"download_url,omitempty"`
	ExpiresAt          *time.Time    `json:"expires_at,omitempty"`
	ErrorMessage       string        `json:"error_message,omitempty"`
	RequestedBy        string        `json:"requested_by"`
	CreatedAt          time.Time     `json:"created_at"`
	StartedAt          *time.Time    `json:"started_at,omitempty"`
	CompletedAt        *time.Time    `json:"completed_at,omitempty"`
}

// DateRange represents a date range for filtering
type DateRange struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`
}

// CreateExportJobRequest represents a request to create an export job
type CreateExportJobRequest struct {
	DomainID           string       `json:"domain_id"`
	UserID             string       `json:"user_id,omitempty"`
	Format             ExportFormat `json:"format"`
	IncludeAttachments bool         `json:"include_attachments"`
	DateRange          *DateRange   `json:"date_range,omitempty"`
	FolderTypes        []FolderType `json:"folder_types,omitempty"`
	RequestedBy        string       `json:"requested_by"`
}

// ExportJobResponse represents the response for an export job
type ExportJobResponse struct {
	JobID       string       `json:"job_id"`
	Status      ExportStatus `json:"status"`
	Progress    float64      `json:"progress"`
	DownloadURL string       `json:"download_url,omitempty"`
	ExpiresAt   *time.Time   `json:"expires_at,omitempty"`
	Message     string       `json:"message,omitempty"`
}

// DeletionJob represents a domain data deletion job (GDPR compliance)
type DeletionJob struct {
	ID                string         `json:"id"`
	OrgID             string         `json:"org_id"`
	DomainID          string         `json:"domain_id"`
	UserID            string         `json:"user_id,omitempty"` // Optional: delete specific user
	Status            DeletionStatus `json:"status"`
	Reason            string         `json:"reason"` // GDPR, account deletion, etc.
	Progress          float64        `json:"progress"`
	TotalMessages     int64          `json:"total_messages"`
	DeletedMessages   int64          `json:"deleted_messages"`
	TotalAttachments  int64          `json:"total_attachments"`
	DeletedAttachments int64         `json:"deleted_attachments"`
	TotalSize         int64          `json:"total_size"`
	DeletedSize       int64          `json:"deleted_size"`
	ClearSearchIndex  bool           `json:"clear_search_index"`
	SearchIndexCleared bool          `json:"search_index_cleared"`
	ErrorMessage      string         `json:"error_message,omitempty"`
	RequestedBy       string         `json:"requested_by"`
	ApprovedBy        string         `json:"approved_by,omitempty"` // For audit trail
	CreatedAt         time.Time      `json:"created_at"`
	StartedAt         *time.Time     `json:"started_at,omitempty"`
	CompletedAt       *time.Time     `json:"completed_at,omitempty"`
}

// DeletionStatus represents the status of a deletion job
type DeletionStatus string

const (
	DeletionStatusPending        DeletionStatus = "pending"
	DeletionStatusApprovalNeeded DeletionStatus = "approval_needed"
	DeletionStatusApproved       DeletionStatus = "approved"
	DeletionStatusRunning        DeletionStatus = "running"
	DeletionStatusCompleted      DeletionStatus = "completed"
	DeletionStatusFailed         DeletionStatus = "failed"
	DeletionStatusCancelled      DeletionStatus = "cancelled"
)

// CreateDeletionJobRequest represents a request to delete domain data
type CreateDeletionJobRequest struct {
	DomainID         string `json:"domain_id"`
	UserID           string `json:"user_id,omitempty"`
	Reason           string `json:"reason"`
	ClearSearchIndex bool   `json:"clear_search_index"`
	RequestedBy      string `json:"requested_by"`
}

// ApproveDeletionRequest represents a request to approve a deletion
type ApproveDeletionRequest struct {
	ApprovedBy string `json:"approved_by"`
}

// DeletionAuditLog tracks deletion operations for compliance
type DeletionAuditLog struct {
	ID            string    `json:"id"`
	JobID         string    `json:"job_id"`
	OrgID         string    `json:"org_id"`
	DomainID      string    `json:"domain_id"`
	UserID        string    `json:"user_id,omitempty"`
	ObjectType    string    `json:"object_type"` // message, attachment, etc.
	ObjectID      string    `json:"object_id"`
	StorageKey    string    `json:"storage_key"`
	Size          int64     `json:"size"`
	Reason        string    `json:"reason"`
	RequestedBy   string    `json:"requested_by"`
	DeletedAt     time.Time `json:"deleted_at"`
}

// MigrationJob represents a domain migration job
type MigrationJob struct {
	ID               string          `json:"id"`
	SourceOrgID      string          `json:"source_org_id"`
	SourceDomainID   string          `json:"source_domain_id"`
	DestOrgID        string          `json:"dest_org_id"`
	DestDomainID     string          `json:"dest_domain_id"`
	Status           MigrationStatus `json:"status"`
	Progress         float64         `json:"progress"`
	TotalMessages    int64           `json:"total_messages"`
	MigratedMessages int64           `json:"migrated_messages"`
	TotalSize        int64           `json:"total_size"`
	MigratedSize     int64           `json:"migrated_size"`
	ErrorMessage     string          `json:"error_message,omitempty"`
	RequestedBy      string          `json:"requested_by"`
	CreatedAt        time.Time       `json:"created_at"`
	StartedAt        *time.Time      `json:"started_at,omitempty"`
	CompletedAt      *time.Time      `json:"completed_at,omitempty"`
}

// MigrationStatus represents the status of a migration job
type MigrationStatus string

const (
	MigrationStatusPending   MigrationStatus = "pending"
	MigrationStatusRunning   MigrationStatus = "running"
	MigrationStatusCompleted MigrationStatus = "completed"
	MigrationStatusFailed    MigrationStatus = "failed"
	MigrationStatusCancelled MigrationStatus = "cancelled"
)

// BulkOperation represents a bulk operation response
type BulkOperationResponse struct {
	Success     int      `json:"success"`
	Failed      int      `json:"failed"`
	Errors      []string `json:"errors,omitempty"`
}
