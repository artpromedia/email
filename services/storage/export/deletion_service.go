package export

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/oonrumail/storage/config"
	"github.com/oonrumail/storage/models"
	"github.com/oonrumail/storage/storage"
)

// DeletionService implements the DeletionService interface
type DeletionService struct {
	db        *pgxpool.Pool
	storage   storage.DomainStorageService
	quotaSvc  storage.QuotaService
	cfg       *config.Config
	logger    zerolog.Logger
}

// NewDeletionService creates a new deletion service
func NewDeletionService(
	db *pgxpool.Pool,
	storageSvc storage.DomainStorageService,
	quotaSvc storage.QuotaService,
	cfg *config.Config,
	logger zerolog.Logger,
) *DeletionService {
	return &DeletionService{
		db:       db,
		storage:  storageSvc,
		quotaSvc: quotaSvc,
		cfg:      cfg,
		logger:   logger.With().Str("component", "deletion_service").Logger(),
	}
}

// Ensure DeletionService implements storage.DeletionService
var _ storage.DeletionService = (*DeletionService)(nil)

// CreateDeletionJob creates a new deletion job
func (s *DeletionService) CreateDeletionJob(ctx context.Context, orgID string, req *models.CreateDeletionJobRequest) (*models.DeletionJob, error) {
	id := uuid.New().String()
	now := time.Now()

	// Determine if approval is needed (for audit purposes)
	status := models.DeletionStatusApprovalNeeded
	if req.Reason == "account_deletion" || req.Reason == "user_request" {
		status = models.DeletionStatusPending
	}

	job := &models.DeletionJob{
		ID:               id,
		OrgID:            orgID,
		DomainID:         req.DomainID,
		UserID:           req.UserID,
		Status:           status,
		Reason:           req.Reason,
		Progress:         0,
		ClearSearchIndex: req.ClearSearchIndex,
		RequestedBy:      req.RequestedBy,
		CreatedAt:        now,
	}

	query := `
		INSERT INTO deletion_jobs (
			id, org_id, domain_id, user_id, status, reason, progress,
			clear_search_index, requested_by, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := s.db.Exec(ctx, query,
		id,
		orgID,
		req.DomainID,
		nullString(req.UserID),
		status,
		req.Reason,
		0,
		req.ClearSearchIndex,
		req.RequestedBy,
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create deletion job: %w", err)
	}

	s.logger.Info().
		Str("job_id", id).
		Str("domain_id", req.DomainID).
		Str("reason", req.Reason).
		Str("status", string(status)).
		Msg("Created deletion job")

	return job, nil
}

// GetDeletionJob retrieves a deletion job by ID
func (s *DeletionService) GetDeletionJob(ctx context.Context, jobID string) (*models.DeletionJob, error) {
	query := `
		SELECT id, org_id, domain_id, user_id, status, reason, progress,
		       total_messages, deleted_messages, total_attachments, deleted_attachments,
		       total_size, deleted_size, clear_search_index, search_index_cleared,
		       error_message, requested_by, approved_by, created_at, started_at, completed_at
		FROM deletion_jobs
		WHERE id = $1
	`

	var job models.DeletionJob
	var userID, errorMessage, approvedBy *string
	var startedAt, completedAt *time.Time

	err := s.db.QueryRow(ctx, query, jobID).Scan(
		&job.ID,
		&job.OrgID,
		&job.DomainID,
		&userID,
		&job.Status,
		&job.Reason,
		&job.Progress,
		&job.TotalMessages,
		&job.DeletedMessages,
		&job.TotalAttachments,
		&job.DeletedAttachments,
		&job.TotalSize,
		&job.DeletedSize,
		&job.ClearSearchIndex,
		&job.SearchIndexCleared,
		&errorMessage,
		&job.RequestedBy,
		&approvedBy,
		&job.CreatedAt,
		&startedAt,
		&completedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get deletion job: %w", err)
	}

	if userID != nil {
		job.UserID = *userID
	}
	if errorMessage != nil {
		job.ErrorMessage = *errorMessage
	}
	if approvedBy != nil {
		job.ApprovedBy = *approvedBy
	}
	if startedAt != nil {
		job.StartedAt = startedAt
	}
	if completedAt != nil {
		job.CompletedAt = completedAt
	}

	return &job, nil
}

// ApproveDeletionJob approves a deletion job
func (s *DeletionService) ApproveDeletionJob(ctx context.Context, jobID string, approvedBy string) error {
	query := `
		UPDATE deletion_jobs 
		SET status = $1, approved_by = $2
		WHERE id = $3 AND status = 'approval_needed'
	`
	result, err := s.db.Exec(ctx, query, models.DeletionStatusApproved, approvedBy, jobID)
	if err != nil {
		return fmt.Errorf("failed to approve deletion job: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("job not found or not pending approval")
	}

	s.logger.Info().
		Str("job_id", jobID).
		Str("approved_by", approvedBy).
		Msg("Approved deletion job")

	return nil
}

// CancelDeletionJob cancels a deletion job
func (s *DeletionService) CancelDeletionJob(ctx context.Context, jobID string) error {
	query := `
		UPDATE deletion_jobs 
		SET status = $1, completed_at = $2
		WHERE id = $3 AND status IN ('pending', 'approval_needed', 'approved')
	`
	_, err := s.db.Exec(ctx, query, models.DeletionStatusCancelled, time.Now(), jobID)
	if err != nil {
		return fmt.Errorf("failed to cancel deletion job: %w", err)
	}

	s.logger.Info().Str("job_id", jobID).Msg("Cancelled deletion job")
	return nil
}

// ProcessDeletionJob processes a deletion job
func (s *DeletionService) ProcessDeletionJob(ctx context.Context, jobID string) error {
	job, err := s.GetDeletionJob(ctx, jobID)
	if err != nil {
		return err
	}

	if job.Status != models.DeletionStatusPending && job.Status != models.DeletionStatusApproved {
		return fmt.Errorf("job is not ready for processing: %s", job.Status)
	}

	// Update status to running
	now := time.Now()
	job.Status = models.DeletionStatusRunning
	job.StartedAt = &now
	s.updateJobStatus(ctx, job)

	s.logger.Info().
		Str("job_id", jobID).
		Str("domain_id", job.DomainID).
		Str("reason", job.Reason).
		Msg("Starting deletion job")

	// Get prefix for deletion
	var prefix string
	if job.UserID != "" {
		prefix = fmt.Sprintf("%s/%s/%s/", job.OrgID, job.DomainID, job.UserID)
	} else {
		prefix = fmt.Sprintf("%s/%s/", job.OrgID, job.DomainID)
	}

	// List all objects
	objects, err := s.storage.ListAll(ctx, prefix)
	if err != nil {
		job.Status = models.DeletionStatusFailed
		job.ErrorMessage = fmt.Sprintf("failed to list objects: %v", err)
		s.updateJobStatus(ctx, job)
		return err
	}

	// Count totals
	for _, obj := range objects {
		job.TotalSize += obj.Size
		if isMessage(obj.Key) {
			job.TotalMessages++
		} else if isAttachment(obj.Key) {
			job.TotalAttachments++
		}
	}
	s.updateJobStatus(ctx, job)

	// Delete objects in batches
	batchSize := 100
	keys := make([]string, 0, batchSize)

	for i, obj := range objects {
		select {
		case <-ctx.Done():
			job.Status = models.DeletionStatusCancelled
			s.updateJobStatus(ctx, job)
			return ctx.Err()
		default:
		}

		keys = append(keys, obj.Key)

		// Log audit entry
		s.logDeletionAudit(ctx, job, obj)

		if len(keys) >= batchSize || i == len(objects)-1 {
			deleted, errors := s.storage.DeleteMultiple(ctx, keys)
			if len(errors) > 0 {
				s.logger.Error().
					Int("deleted", deleted).
					Int("errors", len(errors)).
					Msg("Batch deletion had errors")
			}

			// Update counts
			for _, key := range keys[:deleted] {
				job.DeletedSize += objects[i-len(keys)+1].Size
				if isMessage(key) {
					job.DeletedMessages++
				} else if isAttachment(key) {
					job.DeletedAttachments++
				}
			}

			job.Progress = float64(i+1) * 100 / float64(len(objects))
			s.updateJobStatus(ctx, job)

			keys = keys[:0]
		}
	}

	// Clear search index if requested
	if job.ClearSearchIndex {
		if err := s.clearSearchIndex(ctx, job); err != nil {
			s.logger.Error().Err(err).Msg("Failed to clear search index")
		} else {
			job.SearchIndexCleared = true
		}
	}

	// Update quotas
	s.updateQuotasAfterDeletion(ctx, job)

	// Mark as completed
	completedAt := time.Now()
	job.Status = models.DeletionStatusCompleted
	job.Progress = 100
	job.CompletedAt = &completedAt
	s.updateJobStatus(ctx, job)

	s.logger.Info().
		Str("job_id", jobID).
		Int64("messages_deleted", job.DeletedMessages).
		Int64("attachments_deleted", job.DeletedAttachments).
		Int64("bytes_deleted", job.DeletedSize).
		Msg("Completed deletion job")

	return nil
}

// DeleteDomainData creates and immediately processes a domain deletion job
func (s *DeletionService) DeleteDomainData(ctx context.Context, orgID, domainID string) (*models.DeletionJob, error) {
	job, err := s.CreateDeletionJob(ctx, orgID, &models.CreateDeletionJobRequest{
		DomainID:         domainID,
		Reason:           "domain_deletion",
		ClearSearchIndex: true,
		RequestedBy:      "system",
	})
	if err != nil {
		return nil, err
	}

	// Auto-approve for system deletions
	job.Status = models.DeletionStatusPending

	if err := s.ProcessDeletionJob(ctx, job.ID); err != nil {
		return nil, err
	}

	return s.GetDeletionJob(ctx, job.ID)
}

// DeleteUserData creates and immediately processes a user deletion job
func (s *DeletionService) DeleteUserData(ctx context.Context, orgID, domainID, userID string) (*models.DeletionJob, error) {
	job, err := s.CreateDeletionJob(ctx, orgID, &models.CreateDeletionJobRequest{
		DomainID:         domainID,
		UserID:           userID,
		Reason:           "user_deletion",
		ClearSearchIndex: true,
		RequestedBy:      "system",
	})
	if err != nil {
		return nil, err
	}

	// Auto-approve for system deletions
	job.Status = models.DeletionStatusPending

	if err := s.ProcessDeletionJob(ctx, job.ID); err != nil {
		return nil, err
	}

	return s.GetDeletionJob(ctx, job.ID)
}

// GetDeletionAuditLog retrieves the audit log for a deletion job
func (s *DeletionService) GetDeletionAuditLog(ctx context.Context, jobID string) ([]*models.DeletionAuditLog, error) {
	query := `
		SELECT id, job_id, org_id, domain_id, user_id, object_type, object_id,
		       storage_key, size, reason, requested_by, deleted_at
		FROM deletion_audit_logs
		WHERE job_id = $1
		ORDER BY deleted_at ASC
	`

	rows, err := s.db.Query(ctx, query, jobID)
	if err != nil {
		return nil, fmt.Errorf("failed to get deletion audit log: %w", err)
	}
	defer rows.Close()

	var logs []*models.DeletionAuditLog
	for rows.Next() {
		var log models.DeletionAuditLog
		var userID *string

		err := rows.Scan(
			&log.ID,
			&log.JobID,
			&log.OrgID,
			&log.DomainID,
			&userID,
			&log.ObjectType,
			&log.ObjectID,
			&log.StorageKey,
			&log.Size,
			&log.Reason,
			&log.RequestedBy,
			&log.DeletedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan audit log: %w", err)
		}

		if userID != nil {
			log.UserID = *userID
		}

		logs = append(logs, &log)
	}

	return logs, nil
}

func (s *DeletionService) updateJobStatus(ctx context.Context, job *models.DeletionJob) {
	query := `
		UPDATE deletion_jobs SET
			status = $1, progress = $2, total_messages = $3, deleted_messages = $4,
			total_attachments = $5, deleted_attachments = $6, total_size = $7,
			deleted_size = $8, search_index_cleared = $9, error_message = $10,
			started_at = $11, completed_at = $12
		WHERE id = $13
	`
	_, err := s.db.Exec(ctx, query,
		job.Status,
		job.Progress,
		job.TotalMessages,
		job.DeletedMessages,
		job.TotalAttachments,
		job.DeletedAttachments,
		job.TotalSize,
		job.DeletedSize,
		job.SearchIndexCleared,
		nullString(job.ErrorMessage),
		job.StartedAt,
		job.CompletedAt,
		job.ID,
	)
	if err != nil {
		s.logger.Error().Err(err).Str("job_id", job.ID).Msg("Failed to update deletion job status")
	}
}

func (s *DeletionService) logDeletionAudit(ctx context.Context, job *models.DeletionJob, obj *models.StorageObject) {
	id := uuid.New().String()
	objectType := getObjectType(obj.Key)
	objectID := extractObjectID(obj.Key)

	query := `
		INSERT INTO deletion_audit_logs (
			id, job_id, org_id, domain_id, user_id, object_type, object_id,
			storage_key, size, reason, requested_by, deleted_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err := s.db.Exec(ctx, query,
		id,
		job.ID,
		job.OrgID,
		job.DomainID,
		nullString(job.UserID),
		objectType,
		objectID,
		obj.Key,
		obj.Size,
		job.Reason,
		job.RequestedBy,
		time.Now(),
	)
	if err != nil {
		s.logger.Error().Err(err).Str("key", obj.Key).Msg("Failed to log deletion audit")
	}
}

func (s *DeletionService) clearSearchIndex(ctx context.Context, job *models.DeletionJob) error {
	// This would integrate with the search service to clear indexed data
	// For now, just log the intent
	s.logger.Info().
		Str("domain_id", job.DomainID).
		Str("user_id", job.UserID).
		Msg("Would clear search index")
	return nil
}

func (s *DeletionService) updateQuotasAfterDeletion(ctx context.Context, job *models.DeletionJob) {
	if s.quotaSvc == nil {
		return
	}

	// Recalculate domain usage
	if err := s.quotaSvc.RecalculateDomainUsage(ctx, job.DomainID); err != nil {
		s.logger.Error().Err(err).Str("domain_id", job.DomainID).Msg("Failed to recalculate domain quota")
	}
}

func isMessage(key string) bool {
	return contains(key, "/messages/")
}

func isAttachment(key string) bool {
	return contains(key, "/attachments/")
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func getObjectType(key string) string {
	if isMessage(key) {
		return "message"
	}
	if isAttachment(key) {
		return "attachment"
	}
	return "other"
}

func extractObjectID(key string) string {
	// Extract the last component of the key as the object ID
	lastSlash := len(key) - 1
	for ; lastSlash >= 0 && key[lastSlash] != '/'; lastSlash-- {
	}
	if lastSlash < len(key)-1 {
		return key[lastSlash+1:]
	}
	return key
}
