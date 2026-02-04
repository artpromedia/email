package workers

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/oonrumail/storage/config"
	"github.com/oonrumail/storage/storage"
)

// RetentionWorker processes retention policies
type RetentionWorker struct {
	db        *pgxpool.Pool
	retention storage.RetentionService
	storage   storage.DomainStorageService
	cfg       *config.Config
	logger    zerolog.Logger
	stopCh    chan struct{}
}

// NewRetentionWorker creates a new retention worker
func NewRetentionWorker(
	db *pgxpool.Pool,
	retentionSvc storage.RetentionService,
	storageSvc storage.DomainStorageService,
	cfg *config.Config,
	logger zerolog.Logger,
) *RetentionWorker {
	return &RetentionWorker{
		db:        db,
		retention: retentionSvc,
		storage:   storageSvc,
		cfg:       cfg,
		logger:    logger.With().Str("worker", "retention").Logger(),
		stopCh:    make(chan struct{}),
	}
}

// Start starts the retention worker
func (w *RetentionWorker) Start(ctx context.Context) {
	w.logger.Info().Msg("Starting retention worker")

	ticker := time.NewTicker(time.Duration(w.cfg.Workers.RetentionIntervalMinutes) * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	w.processRetention(ctx)

	for {
		select {
		case <-ctx.Done():
			w.logger.Info().Msg("Retention worker stopped by context")
			return
		case <-w.stopCh:
			w.logger.Info().Msg("Retention worker stopped")
			return
		case <-ticker.C:
			w.processRetention(ctx)
		}
	}
}

// Stop stops the retention worker
func (w *RetentionWorker) Stop() {
	close(w.stopCh)
}

func (w *RetentionWorker) processRetention(ctx context.Context) {
	w.logger.Info().Msg("Processing retention policies")

	// Get all active policies
	policies, err := w.getAllActivePolicies(ctx)
	if err != nil {
		w.logger.Error().Err(err).Msg("Failed to get retention policies")
		return
	}

	for _, policy := range policies {
		if err := w.processDomainRetention(ctx, policy.DomainID); err != nil {
			w.logger.Error().Err(err).
				Str("domain_id", policy.DomainID).
				Msg("Failed to process domain retention")
		}
	}
}

func (w *RetentionWorker) getAllActivePolicies(ctx context.Context) ([]*retentionPolicy, error) {
	query := `
		SELECT id, domain_id, retention_days, deleted_item_days, archive_after_days, archive_tier
		FROM retention_policies
		WHERE enabled = true AND deleted_at IS NULL
	`

	rows, err := w.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []*retentionPolicy
	for rows.Next() {
		var p retentionPolicy
		if err := rows.Scan(&p.ID, &p.DomainID, &p.RetentionDays, &p.DeletedItemDays, &p.ArchiveAfterDays, &p.ArchiveTier); err != nil {
			continue
		}
		policies = append(policies, &p)
	}

	return policies, nil
}

type retentionPolicy struct {
	ID               string
	DomainID         string
	RetentionDays    int
	DeletedItemDays  int
	ArchiveAfterDays int
	ArchiveTier      string
}

func (w *RetentionWorker) processDomainRetention(ctx context.Context, domainID string) error {
	w.logger.Debug().Str("domain_id", domainID).Msg("Processing domain retention")

	// Process using the retention service
	deleted, archived, err := w.retention.ProcessDomainRetention(ctx, domainID)
	if err != nil {
		return err
	}

	if deleted > 0 || archived > 0 {
		w.logger.Info().
			Str("domain_id", domainID).
			Int("deleted", deleted).
			Int("archived", archived).
			Msg("Retention processing complete")
	}

	return nil
}

// ExportWorker processes export jobs
type ExportWorker struct {
	db      *pgxpool.Pool
	export  storage.ExportService
	cfg     *config.Config
	logger  zerolog.Logger
	stopCh  chan struct{}
}

// NewExportWorker creates a new export worker
func NewExportWorker(
	db *pgxpool.Pool,
	exportSvc storage.ExportService,
	cfg *config.Config,
	logger zerolog.Logger,
) *ExportWorker {
	return &ExportWorker{
		db:     db,
		export: exportSvc,
		cfg:    cfg,
		logger: logger.With().Str("worker", "export").Logger(),
		stopCh: make(chan struct{}),
	}
}

// Start starts the export worker
func (w *ExportWorker) Start(ctx context.Context) {
	w.logger.Info().Msg("Starting export worker")

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info().Msg("Export worker stopped by context")
			return
		case <-w.stopCh:
			w.logger.Info().Msg("Export worker stopped")
			return
		case <-ticker.C:
			w.processExportJobs(ctx)
		}
	}
}

// Stop stops the export worker
func (w *ExportWorker) Stop() {
	close(w.stopCh)
}

func (w *ExportWorker) processExportJobs(ctx context.Context) {
	// Get pending export jobs
	jobs, err := w.getPendingExportJobs(ctx)
	if err != nil {
		w.logger.Error().Err(err).Msg("Failed to get pending export jobs")
		return
	}

	for _, jobID := range jobs {
		w.logger.Info().Str("job_id", jobID).Msg("Processing export job")

		if err := w.export.ProcessExportJob(ctx, jobID); err != nil {
			w.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to process export job")
		}
	}
}

func (w *ExportWorker) getPendingExportJobs(ctx context.Context) ([]string, error) {
	query := `
		SELECT id FROM export_jobs
		WHERE status = 'pending'
		ORDER BY created_at ASC
		LIMIT 10
	`

	rows, err := w.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		jobIDs = append(jobIDs, id)
	}

	return jobIDs, nil
}

// DeletionWorker processes deletion jobs
type DeletionWorker struct {
	db       *pgxpool.Pool
	deletion storage.DeletionService
	cfg      *config.Config
	logger   zerolog.Logger
	stopCh   chan struct{}
}

// NewDeletionWorker creates a new deletion worker
func NewDeletionWorker(
	db *pgxpool.Pool,
	deletionSvc storage.DeletionService,
	cfg *config.Config,
	logger zerolog.Logger,
) *DeletionWorker {
	return &DeletionWorker{
		db:       db,
		deletion: deletionSvc,
		cfg:      cfg,
		logger:   logger.With().Str("worker", "deletion").Logger(),
		stopCh:   make(chan struct{}),
	}
}

// Start starts the deletion worker
func (w *DeletionWorker) Start(ctx context.Context) {
	w.logger.Info().Msg("Starting deletion worker")

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info().Msg("Deletion worker stopped by context")
			return
		case <-w.stopCh:
			w.logger.Info().Msg("Deletion worker stopped")
			return
		case <-ticker.C:
			w.processDeletionJobs(ctx)
		}
	}
}

// Stop stops the deletion worker
func (w *DeletionWorker) Stop() {
	close(w.stopCh)
}

func (w *DeletionWorker) processDeletionJobs(ctx context.Context) {
	// Get approved deletion jobs
	jobs, err := w.getApprovedDeletionJobs(ctx)
	if err != nil {
		w.logger.Error().Err(err).Msg("Failed to get approved deletion jobs")
		return
	}

	for _, jobID := range jobs {
		w.logger.Info().Str("job_id", jobID).Msg("Processing deletion job")

		if err := w.deletion.ProcessDeletionJob(ctx, jobID); err != nil {
			w.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to process deletion job")
		}
	}
}

func (w *DeletionWorker) getApprovedDeletionJobs(ctx context.Context) ([]string, error) {
	query := `
		SELECT id FROM deletion_jobs
		WHERE status = 'approved' OR (status = 'pending' AND requires_approval = false)
		ORDER BY created_at ASC
		LIMIT 5
	`

	rows, err := w.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		jobIDs = append(jobIDs, id)
	}

	return jobIDs, nil
}

// DeduplicationWorker cleans up orphaned attachments
type DeduplicationWorker struct {
	db     *pgxpool.Pool
	dedup  storage.DeduplicationService
	cfg    *config.Config
	logger zerolog.Logger
	stopCh chan struct{}
}

// NewDeduplicationWorker creates a new deduplication cleanup worker
func NewDeduplicationWorker(
	db *pgxpool.Pool,
	dedupSvc storage.DeduplicationService,
	cfg *config.Config,
	logger zerolog.Logger,
) *DeduplicationWorker {
	return &DeduplicationWorker{
		db:     db,
		dedup:  dedupSvc,
		cfg:    cfg,
		logger: logger.With().Str("worker", "deduplication").Logger(),
		stopCh: make(chan struct{}),
	}
}

// Start starts the deduplication worker
func (w *DeduplicationWorker) Start(ctx context.Context) {
	w.logger.Info().Msg("Starting deduplication cleanup worker")

	// Run cleanup hourly
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info().Msg("Deduplication worker stopped by context")
			return
		case <-w.stopCh:
			w.logger.Info().Msg("Deduplication worker stopped")
			return
		case <-ticker.C:
			w.cleanup(ctx)
		}
	}
}

// Stop stops the deduplication worker
func (w *DeduplicationWorker) Stop() {
	close(w.stopCh)
}

func (w *DeduplicationWorker) cleanup(ctx context.Context) {
	w.logger.Info().Msg("Running deduplication cleanup")

	count, bytesFreed, err := w.dedup.CleanupOrphans(ctx)
	if err != nil {
		w.logger.Error().Err(err).Msg("Deduplication cleanup failed")
		return
	}

	if count > 0 {
		w.logger.Info().
			Int("count", count).
			Int64("bytes_freed", bytesFreed).
			Msg("Deduplication cleanup complete")
	}
}
