package export

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/storage/config"
	"github.com/enterprise-email/storage/models"
	"github.com/enterprise-email/storage/storage"
)

// Service implements the ExportService interface
type Service struct {
	db       *pgxpool.Pool
	storage  storage.DomainStorageService
	cfg      *config.Config
	logger   zerolog.Logger
}

// NewService creates a new export service
func NewService(
	db *pgxpool.Pool,
	storageSvc storage.DomainStorageService,
	cfg *config.Config,
	logger zerolog.Logger,
) *Service {
	// Ensure export temp directory exists
	if err := os.MkdirAll(cfg.ExportTempDir, 0755); err != nil {
		logger.Error().Err(err).Str("dir", cfg.ExportTempDir).Msg("Failed to create export temp directory")
	}

	return &Service{
		db:      db,
		storage: storageSvc,
		cfg:     cfg,
		logger:  logger.With().Str("component", "export_service").Logger(),
	}
}

// Ensure Service implements ExportService
var _ storage.ExportService = (*Service)(nil)

// CreateExportJob creates a new export job
func (s *Service) CreateExportJob(ctx context.Context, orgID string, req *models.CreateExportJobRequest) (*models.ExportJob, error) {
	id := uuid.New().String()
	now := time.Now()

	job := &models.ExportJob{
		ID:                 id,
		OrgID:              orgID,
		DomainID:           req.DomainID,
		UserID:             req.UserID,
		Format:             req.Format,
		IncludeAttachments: req.IncludeAttachments,
		DateRange:          req.DateRange,
		FolderTypes:        req.FolderTypes,
		Status:             models.ExportStatusPending,
		Progress:           0,
		RequestedBy:        req.RequestedBy,
		CreatedAt:          now,
	}

	query := `
		INSERT INTO export_jobs (
			id, org_id, domain_id, user_id, format, include_attachments,
			date_range_from, date_range_to, folder_types, status, progress,
			requested_by, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`

	var dateFrom, dateTo *time.Time
	if req.DateRange != nil {
		dateFrom = &req.DateRange.From
		dateTo = &req.DateRange.To
	}

	_, err := s.db.Exec(ctx, query,
		id,
		orgID,
		req.DomainID,
		nullString(req.UserID),
		req.Format,
		req.IncludeAttachments,
		dateFrom,
		dateTo,
		req.FolderTypes,
		models.ExportStatusPending,
		0,
		req.RequestedBy,
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create export job: %w", err)
	}

	s.logger.Info().
		Str("job_id", id).
		Str("domain_id", req.DomainID).
		Str("format", string(req.Format)).
		Msg("Created export job")

	return job, nil
}

// GetExportJob retrieves an export job by ID
func (s *Service) GetExportJob(ctx context.Context, jobID string) (*models.ExportJob, error) {
	query := `
		SELECT id, org_id, domain_id, user_id, format, include_attachments,
		       date_range_from, date_range_to, folder_types, status, progress,
		       total_messages, processed_messages, total_size, processed_size,
		       output_key, download_url, expires_at, error_message,
		       requested_by, created_at, started_at, completed_at
		FROM export_jobs
		WHERE id = $1
	`

	var job models.ExportJob
	var userID, outputKey, downloadURL, errorMessage *string
	var expiresAt, startedAt, completedAt *time.Time
	var dateFrom, dateTo *time.Time

	err := s.db.QueryRow(ctx, query, jobID).Scan(
		&job.ID,
		&job.OrgID,
		&job.DomainID,
		&userID,
		&job.Format,
		&job.IncludeAttachments,
		&dateFrom,
		&dateTo,
		&job.FolderTypes,
		&job.Status,
		&job.Progress,
		&job.TotalMessages,
		&job.ProcessedMessages,
		&job.TotalSize,
		&job.ProcessedSize,
		&outputKey,
		&downloadURL,
		&expiresAt,
		&errorMessage,
		&job.RequestedBy,
		&job.CreatedAt,
		&startedAt,
		&completedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get export job: %w", err)
	}

	if userID != nil {
		job.UserID = *userID
	}
	if dateFrom != nil && dateTo != nil {
		job.DateRange = &models.DateRange{From: *dateFrom, To: *dateTo}
	}
	if outputKey != nil {
		job.OutputKey = *outputKey
	}
	if downloadURL != nil {
		job.DownloadURL = *downloadURL
	}
	if expiresAt != nil {
		job.ExpiresAt = expiresAt
	}
	if errorMessage != nil {
		job.ErrorMessage = *errorMessage
	}
	if startedAt != nil {
		job.StartedAt = startedAt
	}
	if completedAt != nil {
		job.CompletedAt = completedAt
	}

	return &job, nil
}

// CancelExportJob cancels an export job
func (s *Service) CancelExportJob(ctx context.Context, jobID string) error {
	query := `
		UPDATE export_jobs 
		SET status = $1, completed_at = $2
		WHERE id = $3 AND status IN ('pending', 'running')
	`
	_, err := s.db.Exec(ctx, query, models.ExportStatusCancelled, time.Now(), jobID)
	if err != nil {
		return fmt.Errorf("failed to cancel export job: %w", err)
	}

	s.logger.Info().Str("job_id", jobID).Msg("Cancelled export job")
	return nil
}

// GetExportJobsForDomain retrieves all export jobs for a domain
func (s *Service) GetExportJobsForDomain(ctx context.Context, domainID string) ([]*models.ExportJob, error) {
	query := `
		SELECT id, org_id, domain_id, user_id, format, include_attachments,
		       status, progress, total_messages, processed_messages,
		       requested_by, created_at, completed_at
		FROM export_jobs
		WHERE domain_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`

	rows, err := s.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get export jobs: %w", err)
	}
	defer rows.Close()

	var jobs []*models.ExportJob
	for rows.Next() {
		var job models.ExportJob
		var userID *string
		var completedAt *time.Time

		err := rows.Scan(
			&job.ID,
			&job.OrgID,
			&job.DomainID,
			&userID,
			&job.Format,
			&job.IncludeAttachments,
			&job.Status,
			&job.Progress,
			&job.TotalMessages,
			&job.ProcessedMessages,
			&job.RequestedBy,
			&job.CreatedAt,
			&completedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan export job: %w", err)
		}

		if userID != nil {
			job.UserID = *userID
		}
		if completedAt != nil {
			job.CompletedAt = completedAt
		}

		jobs = append(jobs, &job)
	}

	return jobs, nil
}

// ProcessExportJob processes an export job
func (s *Service) ProcessExportJob(ctx context.Context, jobID string) error {
	job, err := s.GetExportJob(ctx, jobID)
	if err != nil {
		return err
	}

	if job.Status != models.ExportStatusPending {
		return fmt.Errorf("job is not in pending status: %s", job.Status)
	}

	// Update status to running
	now := time.Now()
	job.Status = models.ExportStatusRunning
	job.StartedAt = &now
	s.updateJobStatus(ctx, job)

	s.logger.Info().
		Str("job_id", jobID).
		Str("domain_id", job.DomainID).
		Str("format", string(job.Format)).
		Msg("Starting export job")

	// Get messages to export
	messages, err := s.getMessagesToExport(ctx, job)
	if err != nil {
		job.Status = models.ExportStatusFailed
		job.ErrorMessage = err.Error()
		s.updateJobStatus(ctx, job)
		return err
	}

	job.TotalMessages = int64(len(messages))
	s.updateJobStatus(ctx, job)

	// Create temporary export file
	tempFile := filepath.Join(s.cfg.ExportTempDir, fmt.Sprintf("%s.zip", jobID))
	zipFile, err := os.Create(tempFile)
	if err != nil {
		job.Status = models.ExportStatusFailed
		job.ErrorMessage = fmt.Sprintf("failed to create temp file: %v", err)
		s.updateJobStatus(ctx, job)
		return err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Export messages based on format
	for i, msg := range messages {
		select {
		case <-ctx.Done():
			job.Status = models.ExportStatusCancelled
			s.updateJobStatus(ctx, job)
			return ctx.Err()
		default:
		}

		if err := s.exportMessage(ctx, zipWriter, job, msg); err != nil {
			s.logger.Error().Err(err).Str("message_id", msg.MessageID).Msg("Failed to export message")
			continue
		}

		job.ProcessedMessages++
		job.ProcessedSize += msg.Size
		job.Progress = float64(i+1) * 100 / float64(len(messages))

		// Update progress periodically
		if i%100 == 0 {
			s.updateJobStatus(ctx, job)
		}
	}

	zipWriter.Close()
	zipFile.Close()

	// Get file size
	fileInfo, err := os.Stat(tempFile)
	if err != nil {
		job.Status = models.ExportStatusFailed
		job.ErrorMessage = fmt.Sprintf("failed to stat temp file: %v", err)
		s.updateJobStatus(ctx, job)
		return err
	}
	job.TotalSize = fileInfo.Size()

	// Upload to storage
	outputKey := fmt.Sprintf("%s/%s/exports/%s.zip", job.OrgID, job.DomainID, jobID)
	uploadFile, err := os.Open(tempFile)
	if err != nil {
		job.Status = models.ExportStatusFailed
		job.ErrorMessage = fmt.Sprintf("failed to open temp file: %v", err)
		s.updateJobStatus(ctx, job)
		return err
	}
	defer uploadFile.Close()

	if err := s.storage.Put(ctx, outputKey, uploadFile, fileInfo.Size(), "application/zip", nil); err != nil {
		job.Status = models.ExportStatusFailed
		job.ErrorMessage = fmt.Sprintf("failed to upload export: %v", err)
		s.updateJobStatus(ctx, job)
		return err
	}

	// Generate download URL
	expiresAt := time.Now().Add(s.cfg.ExportExpiration)
	downloadURL, err := s.storage.GetPresignedDownloadURL(ctx, outputKey, s.cfg.ExportExpiration)
	if err != nil {
		s.logger.Error().Err(err).Msg("Failed to generate download URL")
	}

	// Update job as completed
	completedAt := time.Now()
	job.Status = models.ExportStatusCompleted
	job.Progress = 100
	job.OutputKey = outputKey
	job.DownloadURL = downloadURL
	job.ExpiresAt = &expiresAt
	job.CompletedAt = &completedAt
	s.updateJobStatus(ctx, job)

	// Cleanup temp file
	os.Remove(tempFile)

	s.logger.Info().
		Str("job_id", jobID).
		Int64("messages", job.ProcessedMessages).
		Int64("size", job.TotalSize).
		Msg("Completed export job")

	return nil
}

// GetDownloadURL returns the download URL for an export
func (s *Service) GetDownloadURL(ctx context.Context, jobID string) (string, time.Time, error) {
	job, err := s.GetExportJob(ctx, jobID)
	if err != nil {
		return "", time.Time{}, err
	}

	if job.Status != models.ExportStatusCompleted {
		return "", time.Time{}, fmt.Errorf("export not completed")
	}

	if job.ExpiresAt != nil && time.Now().After(*job.ExpiresAt) {
		return "", time.Time{}, fmt.Errorf("export has expired")
	}

	// Generate fresh download URL
	downloadURL, err := s.storage.GetPresignedDownloadURL(ctx, job.OutputKey, s.cfg.ExportExpiration)
	if err != nil {
		return "", time.Time{}, err
	}

	expiresAt := time.Now().Add(s.cfg.ExportExpiration)
	return downloadURL, expiresAt, nil
}

// CleanupExpiredExports cleans up expired export files
func (s *Service) CleanupExpiredExports(ctx context.Context) (int, error) {
	// Find expired exports
	query := `
		SELECT id, output_key FROM export_jobs
		WHERE status = 'completed' AND expires_at < $1
	`

	rows, err := s.db.Query(ctx, query, time.Now())
	if err != nil {
		return 0, fmt.Errorf("failed to query expired exports: %w", err)
	}
	defer rows.Close()

	var cleaned int
	for rows.Next() {
		var jobID, outputKey string
		if err := rows.Scan(&jobID, &outputKey); err != nil {
			continue
		}

		// Delete from storage
		if outputKey != "" {
			if err := s.storage.Delete(ctx, outputKey); err != nil {
				s.logger.Error().Err(err).Str("key", outputKey).Msg("Failed to delete expired export")
				continue
			}
		}

		// Update status
		_, err := s.db.Exec(ctx, 
			"UPDATE export_jobs SET status = $1 WHERE id = $2",
			models.ExportStatusExpired, jobID)
		if err != nil {
			continue
		}

		cleaned++
	}

	if cleaned > 0 {
		s.logger.Info().Int("count", cleaned).Msg("Cleaned up expired exports")
	}

	return cleaned, nil
}

// getMessagesToExport retrieves messages for export
func (s *Service) getMessagesToExport(ctx context.Context, job *models.ExportJob) ([]*models.MessageMetadata, error) {
	query := `
		SELECT id, storage_key, org_id, domain_id, user_id, mailbox_id,
		       folder_id, subject, "from", "to", date, size, has_attachments
		FROM message_metadata
		WHERE domain_id = $1
	`
	args := []interface{}{job.DomainID}
	argNum := 2

	if job.UserID != "" {
		query += fmt.Sprintf(" AND user_id = $%d", argNum)
		args = append(args, job.UserID)
		argNum++
	}

	if job.DateRange != nil {
		query += fmt.Sprintf(" AND date >= $%d AND date <= $%d", argNum, argNum+1)
		args = append(args, job.DateRange.From, job.DateRange.To)
		argNum += 2
	}

	query += " ORDER BY date ASC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	var messages []*models.MessageMetadata
	for rows.Next() {
		var msg models.MessageMetadata
		err := rows.Scan(
			&msg.MessageID,
			&msg.OrgID, // Using OrgID field temporarily for storage_key
			&msg.OrgID,
			&msg.DomainID,
			&msg.UserID,
			&msg.MailboxID,
			&msg.FolderID,
			&msg.Subject,
			&msg.From,
			&msg.To,
			&msg.Date,
			&msg.Size,
			&msg.HasAttachments,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		messages = append(messages, &msg)
	}

	return messages, nil
}

// exportMessage exports a single message to the zip file
func (s *Service) exportMessage(ctx context.Context, zipWriter *zip.Writer, job *models.ExportJob, msg *models.MessageMetadata) error {
	// Get message content from storage
	reader, _, err := s.storage.GetMessage(ctx, msg.OrgID, msg.DomainID, msg.UserID, msg.MessageID)
	if err != nil {
		return fmt.Errorf("failed to get message: %w", err)
	}
	defer reader.Close()

	// Create filename based on format
	var filename string
	switch job.Format {
	case models.ExportFormatEML:
		filename = fmt.Sprintf("messages/%s/%s.eml", msg.FolderID, msg.MessageID)
	case models.ExportFormatJSON:
		filename = fmt.Sprintf("messages/%s/%s.json", msg.FolderID, msg.MessageID)
	case models.ExportFormatMbox:
		filename = fmt.Sprintf("messages/%s.mbox", msg.FolderID)
	default:
		filename = fmt.Sprintf("messages/%s/%s.eml", msg.FolderID, msg.MessageID)
	}

	// Create file in zip
	writer, err := zipWriter.Create(filename)
	if err != nil {
		return fmt.Errorf("failed to create zip entry: %w", err)
	}

	// Write content based on format
	switch job.Format {
	case models.ExportFormatJSON:
		// Wrap message with metadata
		wrapper := struct {
			Metadata *models.MessageMetadata `json:"metadata"`
			Content  string                  `json:"content"`
		}{
			Metadata: msg,
		}
		// Read content
		content, err := io.ReadAll(reader)
		if err != nil {
			return err
		}
		wrapper.Content = string(content)
		
		encoder := json.NewEncoder(writer)
		encoder.SetIndent("", "  ")
		return encoder.Encode(wrapper)

	case models.ExportFormatMbox:
		// Write mbox format (From line + headers + body)
		bufWriter := bufio.NewWriter(writer)
		fmt.Fprintf(bufWriter, "From %s %s\n", msg.From, msg.Date.Format(time.ANSIC))
		if _, err := io.Copy(bufWriter, reader); err != nil {
			return err
		}
		fmt.Fprintln(bufWriter, "")
		return bufWriter.Flush()

	default:
		// EML format - just copy raw content
		_, err = io.Copy(writer, reader)
		return err
	}
}

func (s *Service) updateJobStatus(ctx context.Context, job *models.ExportJob) {
	query := `
		UPDATE export_jobs SET
			status = $1, progress = $2, total_messages = $3, processed_messages = $4,
			total_size = $5, processed_size = $6, output_key = $7, download_url = $8,
			expires_at = $9, error_message = $10, started_at = $11, completed_at = $12
		WHERE id = $13
	`
	_, err := s.db.Exec(ctx, query,
		job.Status,
		job.Progress,
		job.TotalMessages,
		job.ProcessedMessages,
		job.TotalSize,
		job.ProcessedSize,
		nullString(job.OutputKey),
		nullString(job.DownloadURL),
		job.ExpiresAt,
		nullString(job.ErrorMessage),
		job.StartedAt,
		job.CompletedAt,
		job.ID,
	)
	if err != nil {
		s.logger.Error().Err(err).Str("job_id", job.ID).Msg("Failed to update job status")
	}
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
