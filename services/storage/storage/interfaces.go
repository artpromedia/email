package storage

import (
	"context"
	"io"
	"time"

	"github.com/oonrumail/storage/models"
)

// StorageService defines the interface for object storage operations
type StorageService interface {
	// Basic operations
	Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string, metadata map[string]string) error
	Get(ctx context.Context, key string) (io.ReadCloser, *models.StorageObject, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	GetMetadata(ctx context.Context, key string) (*models.StorageObject, error)

	// List operations
	List(ctx context.Context, prefix string, maxKeys int, startAfter string) (*models.ListResponse, error)
	ListAll(ctx context.Context, prefix string) ([]*models.StorageObject, error)

	// Presigned URLs
	GetPresignedUploadURL(ctx context.Context, key string, contentType string, expiry time.Duration) (string, error)
	GetPresignedDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error)

	// Copy/Move operations
	Copy(ctx context.Context, sourceKey, destKey string) error
	Move(ctx context.Context, sourceKey, destKey string) error

	// Bulk operations
	DeleteMultiple(ctx context.Context, keys []string) (deleted int, errors []error)
	DeleteByPrefix(ctx context.Context, prefix string) (deleted int, errors []error)

	// Multipart upload
	InitiateMultipartUpload(ctx context.Context, key string, contentType string) (uploadID string, error error)
	UploadPart(ctx context.Context, key string, uploadID string, partNumber int, reader io.Reader, size int64) (etag string, err error)
	CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []CompletedPart) error
	AbortMultipartUpload(ctx context.Context, key string, uploadID string) error

	// Storage metrics
	GetBucketSize(ctx context.Context) (int64, error)
	GetPrefixSize(ctx context.Context, prefix string) (int64, error)
}

// CompletedPart represents a completed part in multipart upload
type CompletedPart struct {
	PartNumber int
	ETag       string
}

// DomainStorageService provides domain-aware storage operations
type DomainStorageService interface {
	StorageService

	// Domain-partitioned operations
	StoreMessage(ctx context.Context, req *StoreMessageRequest) (*models.StorageObject, error)
	GetMessage(ctx context.Context, orgID, domainID, userID, messageID string) (io.ReadCloser, *models.MessageMetadata, error)
	DeleteMessage(ctx context.Context, orgID, domainID, userID, messageID string) error
	
	// Attachment operations (with deduplication)
	StoreAttachment(ctx context.Context, req *StoreAttachmentRequest) (*models.AttachmentMetadata, error)
	GetAttachment(ctx context.Context, orgID, domainID, userID, attachmentID string) (io.ReadCloser, *models.AttachmentMetadata, error)
	DeleteAttachment(ctx context.Context, orgID, domainID, userID, attachmentID string) error

	// Domain-level operations
	GetDomainSize(ctx context.Context, orgID, domainID string) (int64, int64, error) // returns size, count
	GetUserSize(ctx context.Context, orgID, domainID, userID string) (int64, int64, error)
	
	// Cross-domain operations
	CopyBetweenDomains(ctx context.Context, req *models.CopyRequest) error
	MoveBetweenDomains(ctx context.Context, req *models.MoveRequest) error
}

// StoreMessageRequest contains parameters for storing a message
type StoreMessageRequest struct {
	OrgID       string
	DomainID    string
	UserID      string
	MailboxID   string
	FolderID    string
	MessageID   string
	Content     io.Reader
	Size        int64
	ContentType string
	Metadata    *models.MessageMetadata
}

// StoreAttachmentRequest contains parameters for storing an attachment
type StoreAttachmentRequest struct {
	OrgID       string
	DomainID    string
	UserID      string
	MessageID   string
	Content     io.Reader
	Size        int64
	ContentType string
	Filename    string
	ContentHash string // Optional: for dedup check before upload
}

// QuotaService defines the interface for quota management
type QuotaService interface {
	// Get quotas
	GetOrganizationQuota(ctx context.Context, orgID string) (*models.Quota, error)
	GetDomainQuota(ctx context.Context, domainID string) (*models.Quota, error)
	GetUserQuota(ctx context.Context, userID string) (*models.Quota, error)
	GetMailboxQuota(ctx context.Context, mailboxID string) (*models.Quota, error)

	// Create/Update quotas
	CreateQuota(ctx context.Context, req *models.CreateQuotaRequest) (*models.Quota, error)
	UpdateQuota(ctx context.Context, quotaID string, req *models.UpdateQuotaRequest) (*models.Quota, error)
	DeleteQuota(ctx context.Context, quotaID string) error

	// Check quota (hierarchical check from mailbox up to org)
	CheckQuota(ctx context.Context, mailboxID string, additionalBytes int64) (*models.QuotaCheckResult, error)
	CheckDomainQuota(ctx context.Context, domainID string, additionalBytes int64) (*models.QuotaCheckResult, error)

	// Update usage
	UpdateUsage(ctx context.Context, mailboxID string, deltaBytes int64) error
	RecalculateUsage(ctx context.Context, mailboxID string) error
	RecalculateDomainUsage(ctx context.Context, domainID string) error

	// Get quota info
	GetQuotaInfo(ctx context.Context, mailboxID string) (*models.QuotaInfo, error)
	GetDomainQuotaInfo(ctx context.Context, domainID string) (*models.QuotaInfo, error)

	// Reserve/Release quota for pending operations
	ReserveQuota(ctx context.Context, mailboxID string, bytes int64) (reservationID string, err error)
	ReleaseReservation(ctx context.Context, reservationID string) error
	CommitReservation(ctx context.Context, reservationID string) error
}

// RetentionService defines the interface for retention policy management
type RetentionService interface {
	// Policy management
	CreatePolicy(ctx context.Context, req *models.CreateRetentionPolicyRequest) (*models.RetentionPolicy, error)
	UpdatePolicy(ctx context.Context, policyID string, req *models.UpdateRetentionPolicyRequest) (*models.RetentionPolicy, error)
	DeletePolicy(ctx context.Context, policyID string) error
	GetPolicy(ctx context.Context, policyID string) (*models.RetentionPolicy, error)
	GetPoliciesForDomain(ctx context.Context, domainID string) ([]*models.RetentionPolicy, error)

	// Find applicable policy for a message
	GetApplicablePolicy(ctx context.Context, domainID string, folderType models.FolderType, folderID string) (*models.RetentionPolicy, error)
	CheckMessageExpiration(ctx context.Context, message *models.RetentionCandidate) (*models.RetentionPolicyMatch, error)

	// Process retention
	ProcessDomainRetention(ctx context.Context, domainID string) (*models.RetentionSummary, error)
	ProcessAllRetention(ctx context.Context) ([]*models.RetentionSummary, error)
	
	// Legal holds
	CreateLegalHold(ctx context.Context, hold *models.LegalHold) error
	GetLegalHolds(ctx context.Context, orgID string) ([]*models.LegalHold, error)
	IsUnderLegalHold(ctx context.Context, orgID, domainID, userID string, messageDate time.Time) (bool, error)
	ReleaseLegalHold(ctx context.Context, holdID string) error
}

// ExportService defines the interface for data export operations
type ExportService interface {
	// Export operations
	CreateExportJob(ctx context.Context, orgID string, req *models.CreateExportJobRequest) (*models.ExportJob, error)
	GetExportJob(ctx context.Context, jobID string) (*models.ExportJob, error)
	CancelExportJob(ctx context.Context, jobID string) error
	GetExportJobsForDomain(ctx context.Context, domainID string) ([]*models.ExportJob, error)
	
	// Process export
	ProcessExportJob(ctx context.Context, jobID string) error
	GetDownloadURL(ctx context.Context, jobID string) (string, time.Time, error)
	
	// Cleanup
	CleanupExpiredExports(ctx context.Context) (int, error)
}

// DeletionService defines the interface for data deletion operations
type DeletionService interface {
	// Deletion job management
	CreateDeletionJob(ctx context.Context, orgID string, req *models.CreateDeletionJobRequest) (*models.DeletionJob, error)
	GetDeletionJob(ctx context.Context, jobID string) (*models.DeletionJob, error)
	ApproveDeletionJob(ctx context.Context, jobID string, approvedBy string) error
	CancelDeletionJob(ctx context.Context, jobID string) error
	
	// Process deletion
	ProcessDeletionJob(ctx context.Context, jobID string) error
	
	// Direct deletion (for immediate needs)
	DeleteDomainData(ctx context.Context, orgID, domainID string) (*models.DeletionJob, error)
	DeleteUserData(ctx context.Context, orgID, domainID, userID string) (*models.DeletionJob, error)
	
	// Audit
	GetDeletionAuditLog(ctx context.Context, jobID string) ([]*models.DeletionAuditLog, error)
}

// DeduplicationService defines the interface for attachment deduplication
type DeduplicationService interface {
	// Check for existing duplicate
	CheckDuplicate(ctx context.Context, orgID string, contentHash string) (*models.DeduplicationResult, error)
	
	// Register attachment (creates reference)
	RegisterAttachment(ctx context.Context, dedup *models.DeduplicatedAttachment, ref *models.AttachmentReference) error
	
	// Add reference to existing deduplicated attachment
	AddReference(ctx context.Context, dedupID string, ref *models.AttachmentReference) error
	
	// Remove reference (and cleanup if last reference)
	RemoveReference(ctx context.Context, refID string) error
	
	// Get attachment by reference
	GetByReference(ctx context.Context, refID string) (*models.DeduplicatedAttachment, *models.AttachmentReference, error)
	
	// Get references for a message
	GetReferencesForMessage(ctx context.Context, messageID string) ([]*models.AttachmentReference, error)
	
	// Cleanup orphaned attachments
	CleanupOrphans(ctx context.Context) (int, int64, error) // returns count, bytes freed
	
	// Statistics
	GetStats(ctx context.Context, orgID string) (*models.DeduplicationStats, error)
}
