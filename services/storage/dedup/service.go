package dedup

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

// Service implements the DeduplicationService interface
type Service struct {
	db       *pgxpool.Pool
	storage  storage.StorageService
	cfg      *config.Config
	dedupCfg *models.DeduplicationConfig
	logger   zerolog.Logger
}

// NewService creates a new deduplication service
func NewService(
	db *pgxpool.Pool,
	storageSvc storage.StorageService,
	cfg *config.Config,
	logger zerolog.Logger,
) *Service {
	return &Service{
		db:       db,
		storage:  storageSvc,
		cfg:      cfg,
		dedupCfg: models.DefaultDeduplicationConfig(),
		logger:   logger.With().Str("component", "dedup_service").Logger(),
	}
}

// Ensure Service implements DeduplicationService
var _ storage.DeduplicationService = (*Service)(nil)

// CheckDuplicate checks if content with the given hash already exists
func (s *Service) CheckDuplicate(ctx context.Context, orgID string, contentHash string) (*models.DeduplicationResult, error) {
	query := `
		SELECT id, org_id, content_hash, storage_key, size, content_type, ref_count,
		       first_seen_at, last_seen_at, created_at, updated_at
		FROM deduplicated_attachments
		WHERE org_id = $1 AND content_hash = $2
	`

	var dedup models.DeduplicatedAttachment
	err := s.db.QueryRow(ctx, query, orgID, contentHash).Scan(
		&dedup.ID,
		&dedup.OrgID,
		&dedup.ContentHash,
		&dedup.StorageKey,
		&dedup.Size,
		&dedup.ContentType,
		&dedup.RefCount,
		&dedup.FirstSeenAt,
		&dedup.LastSeenAt,
		&dedup.CreatedAt,
		&dedup.UpdatedAt,
	)

	if err != nil {
		// No duplicate found
		return &models.DeduplicationResult{
			IsDuplicate: false,
			ContentHash: contentHash,
		}, nil
	}

	return &models.DeduplicationResult{
		IsDuplicate: true,
		Existing:    &dedup,
		ContentHash: contentHash,
		SpaceSaved:  dedup.Size,
	}, nil
}

// RegisterAttachment registers a new deduplicated attachment
func (s *Service) RegisterAttachment(ctx context.Context, dedup *models.DeduplicatedAttachment, ref *models.AttachmentReference) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert deduplicated attachment
	dedupQuery := `
		INSERT INTO deduplicated_attachments (
			id, org_id, content_hash, storage_key, size, content_type, ref_count,
			first_seen_at, last_seen_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`

	_, err = tx.Exec(ctx, dedupQuery,
		dedup.ID,
		dedup.OrgID,
		dedup.ContentHash,
		dedup.StorageKey,
		dedup.Size,
		dedup.ContentType,
		dedup.RefCount,
		dedup.FirstSeenAt,
		dedup.LastSeenAt,
		dedup.CreatedAt,
		dedup.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert deduplicated attachment: %w", err)
	}

	// Insert reference
	refQuery := `
		INSERT INTO attachment_references (
			id, dedup_id, org_id, domain_id, user_id, mailbox_id, message_id,
			filename, content_type, size, content_id, is_inline, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`

	_, err = tx.Exec(ctx, refQuery,
		ref.ID,
		ref.DedupID,
		ref.OrgID,
		ref.DomainID,
		ref.UserID,
		ref.MailboxID,
		ref.MessageID,
		ref.Filename,
		ref.ContentType,
		ref.Size,
		nullString(ref.ContentID),
		ref.IsInline,
		ref.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert attachment reference: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.logger.Info().
		Str("dedup_id", dedup.ID).
		Str("ref_id", ref.ID).
		Str("content_hash", dedup.ContentHash).
		Int64("size", dedup.Size).
		Msg("Registered deduplicated attachment")

	return nil
}

// AddReference adds a reference to an existing deduplicated attachment
func (s *Service) AddReference(ctx context.Context, dedupID string, ref *models.AttachmentReference) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert reference
	refQuery := `
		INSERT INTO attachment_references (
			id, dedup_id, org_id, domain_id, user_id, mailbox_id, message_id,
			filename, content_type, size, content_id, is_inline, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`

	_, err = tx.Exec(ctx, refQuery,
		ref.ID,
		dedupID,
		ref.OrgID,
		ref.DomainID,
		ref.UserID,
		ref.MailboxID,
		ref.MessageID,
		ref.Filename,
		ref.ContentType,
		ref.Size,
		nullString(ref.ContentID),
		ref.IsInline,
		ref.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert attachment reference: %w", err)
	}

	// Increment ref count
	updateQuery := `
		UPDATE deduplicated_attachments 
		SET ref_count = ref_count + 1, last_seen_at = $1, updated_at = $1
		WHERE id = $2
	`

	_, err = tx.Exec(ctx, updateQuery, time.Now(), dedupID)
	if err != nil {
		return fmt.Errorf("failed to update ref count: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.logger.Debug().
		Str("dedup_id", dedupID).
		Str("ref_id", ref.ID).
		Str("message_id", ref.MessageID).
		Msg("Added attachment reference")

	return nil
}

// RemoveReference removes a reference and cleans up if last reference
func (s *Service) RemoveReference(ctx context.Context, refID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get the reference to find the dedup_id
	var dedupID string
	err = tx.QueryRow(ctx, "SELECT dedup_id FROM attachment_references WHERE id = $1", refID).Scan(&dedupID)
	if err != nil {
		return fmt.Errorf("reference not found: %w", err)
	}

	// Delete the reference
	_, err = tx.Exec(ctx, "DELETE FROM attachment_references WHERE id = $1", refID)
	if err != nil {
		return fmt.Errorf("failed to delete reference: %w", err)
	}

	// Decrement ref count
	updateQuery := `
		UPDATE deduplicated_attachments 
		SET ref_count = GREATEST(0, ref_count - 1), updated_at = $1
		WHERE id = $2
		RETURNING ref_count, storage_key
	`

	var refCount int
	var storageKey string
	err = tx.QueryRow(ctx, updateQuery, time.Now(), dedupID).Scan(&refCount, &storageKey)
	if err != nil {
		return fmt.Errorf("failed to update ref count: %w", err)
	}

	// If this was the last reference, delete the deduplicated attachment
	if refCount == 0 {
		// Delete from storage
		if err := s.storage.Delete(ctx, storageKey); err != nil {
			s.logger.Error().Err(err).Str("key", storageKey).Msg("Failed to delete orphaned attachment from storage")
		}

		// Delete the dedup record
		_, err = tx.Exec(ctx, "DELETE FROM deduplicated_attachments WHERE id = $1", dedupID)
		if err != nil {
			return fmt.Errorf("failed to delete deduplicated attachment: %w", err)
		}

		s.logger.Info().
			Str("dedup_id", dedupID).
			Str("storage_key", storageKey).
			Msg("Cleaned up orphaned deduplicated attachment")
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.logger.Debug().
		Str("ref_id", refID).
		Str("dedup_id", dedupID).
		Int("remaining_refs", refCount).
		Msg("Removed attachment reference")

	return nil
}

// GetByReference retrieves a deduplicated attachment by reference ID
func (s *Service) GetByReference(ctx context.Context, refID string) (*models.DeduplicatedAttachment, *models.AttachmentReference, error) {
	// Get the reference
	refQuery := `
		SELECT id, dedup_id, org_id, domain_id, user_id, mailbox_id, message_id,
		       filename, content_type, size, content_id, is_inline, created_at
		FROM attachment_references
		WHERE id = $1
	`

	var ref models.AttachmentReference
	var contentID *string
	err := s.db.QueryRow(ctx, refQuery, refID).Scan(
		&ref.ID,
		&ref.DedupID,
		&ref.OrgID,
		&ref.DomainID,
		&ref.UserID,
		&ref.MailboxID,
		&ref.MessageID,
		&ref.Filename,
		&ref.ContentType,
		&ref.Size,
		&contentID,
		&ref.IsInline,
		&ref.CreatedAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("reference not found: %w", err)
	}

	if contentID != nil {
		ref.ContentID = *contentID
	}

	// Get the deduplicated attachment
	dedupQuery := `
		SELECT id, org_id, content_hash, storage_key, size, content_type, ref_count,
		       first_seen_at, last_seen_at, created_at, updated_at
		FROM deduplicated_attachments
		WHERE id = $1
	`

	var dedup models.DeduplicatedAttachment
	err = s.db.QueryRow(ctx, dedupQuery, ref.DedupID).Scan(
		&dedup.ID,
		&dedup.OrgID,
		&dedup.ContentHash,
		&dedup.StorageKey,
		&dedup.Size,
		&dedup.ContentType,
		&dedup.RefCount,
		&dedup.FirstSeenAt,
		&dedup.LastSeenAt,
		&dedup.CreatedAt,
		&dedup.UpdatedAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("deduplicated attachment not found: %w", err)
	}

	return &dedup, &ref, nil
}

// GetReferencesForMessage retrieves all attachment references for a message
func (s *Service) GetReferencesForMessage(ctx context.Context, messageID string) ([]*models.AttachmentReference, error) {
	query := `
		SELECT id, dedup_id, org_id, domain_id, user_id, mailbox_id, message_id,
		       filename, content_type, size, content_id, is_inline, created_at
		FROM attachment_references
		WHERE message_id = $1
	`

	rows, err := s.db.Query(ctx, query, messageID)
	if err != nil {
		return nil, fmt.Errorf("failed to get references: %w", err)
	}
	defer rows.Close()

	var refs []*models.AttachmentReference
	for rows.Next() {
		var ref models.AttachmentReference
		var contentID *string
		err := rows.Scan(
			&ref.ID,
			&ref.DedupID,
			&ref.OrgID,
			&ref.DomainID,
			&ref.UserID,
			&ref.MailboxID,
			&ref.MessageID,
			&ref.Filename,
			&ref.ContentType,
			&ref.Size,
			&contentID,
			&ref.IsInline,
			&ref.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan reference: %w", err)
		}
		if contentID != nil {
			ref.ContentID = *contentID
		}
		refs = append(refs, &ref)
	}

	return refs, nil
}

// CleanupOrphans removes deduplicated attachments with zero references
func (s *Service) CleanupOrphans(ctx context.Context) (int, int64, error) {
	// Find orphans that have been at zero refs for longer than grace period
	cutoff := time.Now().Add(-s.dedupCfg.OrphanGracePeriod)

	query := `
		SELECT id, storage_key, size 
		FROM deduplicated_attachments
		WHERE ref_count = 0 AND updated_at < $1
	`

	rows, err := s.db.Query(ctx, query, cutoff)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to query orphans: %w", err)
	}
	defer rows.Close()

	var orphans []struct {
		ID         string
		StorageKey string
		Size       int64
	}

	for rows.Next() {
		var o struct {
			ID         string
			StorageKey string
			Size       int64
		}
		if err := rows.Scan(&o.ID, &o.StorageKey, &o.Size); err != nil {
			continue
		}
		orphans = append(orphans, o)
	}

	var cleaned int
	var bytesFreed int64

	for _, orphan := range orphans {
		// Delete from storage
		if err := s.storage.Delete(ctx, orphan.StorageKey); err != nil {
			s.logger.Error().Err(err).Str("key", orphan.StorageKey).Msg("Failed to delete orphan from storage")
			continue
		}

		// Delete record
		_, err := s.db.Exec(ctx, "DELETE FROM deduplicated_attachments WHERE id = $1", orphan.ID)
		if err != nil {
			s.logger.Error().Err(err).Str("id", orphan.ID).Msg("Failed to delete orphan record")
			continue
		}

		cleaned++
		bytesFreed += orphan.Size
	}

	if cleaned > 0 {
		s.logger.Info().
			Int("count", cleaned).
			Int64("bytes_freed", bytesFreed).
			Msg("Cleaned up orphaned attachments")
	}

	return cleaned, bytesFreed, nil
}

// GetStats returns deduplication statistics for an organization
func (s *Service) GetStats(ctx context.Context, orgID string) (*models.DeduplicationStats, error) {
	stats := &models.DeduplicationStats{
		OrgID: orgID,
	}

	// Get total attachments (sum of all ref_counts)
	err := s.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(ref_count), 0) FROM deduplicated_attachments WHERE org_id = $1",
		orgID,
	).Scan(&stats.TotalAttachments)
	if err != nil {
		return nil, fmt.Errorf("failed to get total attachments: %w", err)
	}

	// Get unique attachments count
	err = s.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM deduplicated_attachments WHERE org_id = $1",
		orgID,
	).Scan(&stats.UniqueAttachments)
	if err != nil {
		return nil, fmt.Errorf("failed to get unique attachments: %w", err)
	}

	// Get total storage used (actual storage)
	err = s.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(size), 0) FROM deduplicated_attachments WHERE org_id = $1",
		orgID,
	).Scan(&stats.TotalStorageUsed)
	if err != nil {
		return nil, fmt.Errorf("failed to get storage used: %w", err)
	}

	// Calculate duplicates and savings
	stats.DuplicateCount = stats.TotalAttachments - stats.UniqueAttachments

	// Get what storage would be without dedup
	var virtualSize int64
	err = s.db.QueryRow(ctx,
		"SELECT COALESCE(SUM(size * ref_count), 0) FROM deduplicated_attachments WHERE org_id = $1",
		orgID,
	).Scan(&virtualSize)
	if err != nil {
		return nil, fmt.Errorf("failed to get virtual size: %w", err)
	}

	stats.StorageSaved = virtualSize - stats.TotalStorageUsed

	if virtualSize > 0 {
		stats.DeduplicationRatio = float64(stats.StorageSaved) * 100 / float64(virtualSize)
	}

	return stats, nil
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
