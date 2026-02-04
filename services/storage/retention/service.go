package retention

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

// Service implements the RetentionService interface
type Service struct {
	db         *pgxpool.Pool
	storage    storage.DomainStorageService
	quotaSvc   storage.QuotaService
	cfg        *config.Config
	logger     zerolog.Logger
}

// NewService creates a new retention service
func NewService(
	db *pgxpool.Pool,
	storageSvc storage.DomainStorageService,
	quotaSvc storage.QuotaService,
	cfg *config.Config,
	logger zerolog.Logger,
) *Service {
	return &Service{
		db:       db,
		storage:  storageSvc,
		quotaSvc: quotaSvc,
		cfg:      cfg,
		logger:   logger.With().Str("component", "retention_service").Logger(),
	}
}

// Ensure Service implements RetentionService
var _ storage.RetentionService = (*Service)(nil)

// CreatePolicy creates a new retention policy
func (s *Service) CreatePolicy(ctx context.Context, req *models.CreateRetentionPolicyRequest) (*models.RetentionPolicy, error) {
	id := uuid.New().String()
	now := time.Now()

	priority := req.Priority
	if priority == 0 {
		// Auto-set priority based on specificity
		switch req.FolderType {
		case models.FolderTypeAll:
			priority = 10
		case models.FolderTypeCustom:
			priority = 100
		default:
			priority = 50
		}
	}

	query := `
		INSERT INTO retention_policies (
			id, domain_id, folder_type, folder_id, retention_days, action,
			enabled, priority, exclude_starred, exclude_labels, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
	`

	_, err := s.db.Exec(ctx, query,
		id,
		req.DomainID,
		req.FolderType,
		nullString(req.FolderID),
		req.RetentionDays,
		req.Action,
		req.Enabled,
		priority,
		req.ExcludeStarred,
		req.ExcludeLabels,
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create retention policy: %w", err)
	}

	s.logger.Info().
		Str("id", id).
		Str("domain_id", req.DomainID).
		Str("folder_type", string(req.FolderType)).
		Int("retention_days", req.RetentionDays).
		Str("action", string(req.Action)).
		Msg("Created retention policy")

	return &models.RetentionPolicy{
		ID:             id,
		DomainID:       req.DomainID,
		FolderType:     req.FolderType,
		FolderID:       req.FolderID,
		RetentionDays:  req.RetentionDays,
		Action:         req.Action,
		Enabled:        req.Enabled,
		Priority:       priority,
		ExcludeStarred: req.ExcludeStarred,
		ExcludeLabels:  req.ExcludeLabels,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

// UpdatePolicy updates an existing retention policy
func (s *Service) UpdatePolicy(ctx context.Context, policyID string, req *models.UpdateRetentionPolicyRequest) (*models.RetentionPolicy, error) {
	updates := []string{}
	args := []interface{}{}
	argNum := 1

	if req.RetentionDays != nil {
		updates = append(updates, fmt.Sprintf("retention_days = $%d", argNum))
		args = append(args, *req.RetentionDays)
		argNum++
	}
	if req.Action != nil {
		updates = append(updates, fmt.Sprintf("action = $%d", argNum))
		args = append(args, *req.Action)
		argNum++
	}
	if req.Enabled != nil {
		updates = append(updates, fmt.Sprintf("enabled = $%d", argNum))
		args = append(args, *req.Enabled)
		argNum++
	}
	if req.Priority != nil {
		updates = append(updates, fmt.Sprintf("priority = $%d", argNum))
		args = append(args, *req.Priority)
		argNum++
	}
	if req.ExcludeStarred != nil {
		updates = append(updates, fmt.Sprintf("exclude_starred = $%d", argNum))
		args = append(args, *req.ExcludeStarred)
		argNum++
	}
	if req.ExcludeLabels != nil {
		updates = append(updates, fmt.Sprintf("exclude_labels = $%d", argNum))
		args = append(args, req.ExcludeLabels)
		argNum++
	}

	if len(updates) == 0 {
		return s.GetPolicy(ctx, policyID)
	}

	updates = append(updates, fmt.Sprintf("updated_at = $%d", argNum))
	args = append(args, time.Now())
	argNum++

	args = append(args, policyID)

	query := fmt.Sprintf("UPDATE retention_policies SET %s WHERE id = $%d",
		joinStrings(updates, ", "), argNum)

	_, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update retention policy: %w", err)
	}

	return s.GetPolicy(ctx, policyID)
}

// DeletePolicy deletes a retention policy
func (s *Service) DeletePolicy(ctx context.Context, policyID string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM retention_policies WHERE id = $1", policyID)
	return err
}

// GetPolicy retrieves a retention policy by ID
func (s *Service) GetPolicy(ctx context.Context, policyID string) (*models.RetentionPolicy, error) {
	query := `
		SELECT id, domain_id, folder_type, folder_id, retention_days, action,
		       enabled, priority, exclude_starred, exclude_labels, created_at, updated_at
		FROM retention_policies
		WHERE id = $1
	`

	var policy models.RetentionPolicy
	var folderID *string
	err := s.db.QueryRow(ctx, query, policyID).Scan(
		&policy.ID,
		&policy.DomainID,
		&policy.FolderType,
		&folderID,
		&policy.RetentionDays,
		&policy.Action,
		&policy.Enabled,
		&policy.Priority,
		&policy.ExcludeStarred,
		&policy.ExcludeLabels,
		&policy.CreatedAt,
		&policy.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get retention policy: %w", err)
	}

	if folderID != nil {
		policy.FolderID = *folderID
	}

	return &policy, nil
}

// GetPoliciesForDomain retrieves all retention policies for a domain
func (s *Service) GetPoliciesForDomain(ctx context.Context, domainID string) ([]*models.RetentionPolicy, error) {
	query := `
		SELECT id, domain_id, folder_type, folder_id, retention_days, action,
		       enabled, priority, exclude_starred, exclude_labels, created_at, updated_at
		FROM retention_policies
		WHERE domain_id = $1
		ORDER BY priority DESC
	`

	rows, err := s.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get retention policies: %w", err)
	}
	defer rows.Close()

	var policies []*models.RetentionPolicy
	for rows.Next() {
		var policy models.RetentionPolicy
		var folderID *string
		err := rows.Scan(
			&policy.ID,
			&policy.DomainID,
			&policy.FolderType,
			&folderID,
			&policy.RetentionDays,
			&policy.Action,
			&policy.Enabled,
			&policy.Priority,
			&policy.ExcludeStarred,
			&policy.ExcludeLabels,
			&policy.CreatedAt,
			&policy.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan retention policy: %w", err)
		}
		if folderID != nil {
			policy.FolderID = *folderID
		}
		policies = append(policies, &policy)
	}

	return policies, nil
}

// GetApplicablePolicy finds the most applicable retention policy for a message
func (s *Service) GetApplicablePolicy(ctx context.Context, domainID string, folderType models.FolderType, folderID string) (*models.RetentionPolicy, error) {
	// First try to find a specific folder policy
	if folderID != "" {
		query := `
			SELECT id, domain_id, folder_type, folder_id, retention_days, action,
			       enabled, priority, exclude_starred, exclude_labels, created_at, updated_at
			FROM retention_policies
			WHERE domain_id = $1 AND folder_id = $2 AND enabled = true
			ORDER BY priority DESC
			LIMIT 1
		`
		var policy models.RetentionPolicy
		var fid *string
		err := s.db.QueryRow(ctx, query, domainID, folderID).Scan(
			&policy.ID,
			&policy.DomainID,
			&policy.FolderType,
			&fid,
			&policy.RetentionDays,
			&policy.Action,
			&policy.Enabled,
			&policy.Priority,
			&policy.ExcludeStarred,
			&policy.ExcludeLabels,
			&policy.CreatedAt,
			&policy.UpdatedAt,
		)
		if err == nil {
			if fid != nil {
				policy.FolderID = *fid
			}
			return &policy, nil
		}
	}

	// Try to find a folder type policy
	query := `
		SELECT id, domain_id, folder_type, folder_id, retention_days, action,
		       enabled, priority, exclude_starred, exclude_labels, created_at, updated_at
		FROM retention_policies
		WHERE domain_id = $1 AND (folder_type = $2 OR folder_type = 'all') AND enabled = true
		ORDER BY priority DESC
		LIMIT 1
	`
	var policy models.RetentionPolicy
	var fid *string
	err := s.db.QueryRow(ctx, query, domainID, folderType).Scan(
		&policy.ID,
		&policy.DomainID,
		&policy.FolderType,
		&fid,
		&policy.RetentionDays,
		&policy.Action,
		&policy.Enabled,
		&policy.Priority,
		&policy.ExcludeStarred,
		&policy.ExcludeLabels,
		&policy.CreatedAt,
		&policy.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("no applicable retention policy found: %w", err)
	}

	if fid != nil {
		policy.FolderID = *fid
	}
	return &policy, nil
}

// CheckMessageExpiration checks if a message should be expired based on retention policy
func (s *Service) CheckMessageExpiration(ctx context.Context, message *models.RetentionCandidate) (*models.RetentionPolicyMatch, error) {
	policy, err := s.GetApplicablePolicy(ctx, message.DomainID, message.FolderType, message.FolderID)
	if err != nil {
		return nil, err
	}

	// Check exclusions
	if policy.ExcludeStarred && message.IsStarred {
		return nil, nil // Not subject to retention
	}

	for _, excludeLabel := range policy.ExcludeLabels {
		for _, label := range message.Labels {
			if label == excludeLabel {
				return nil, nil // Not subject to retention
			}
		}
	}

	// Calculate expiration
	expiresAt := message.MessageDate.AddDate(0, 0, policy.RetentionDays)
	if time.Now().Before(expiresAt) {
		return nil, nil // Not yet expired
	}

	return &models.RetentionPolicyMatch{
		Policy:    policy,
		MatchedAt: time.Now(),
		ExpiresAt: expiresAt,
		Action:    policy.Action,
	}, nil
}

// ProcessDomainRetention processes retention policies for a domain
func (s *Service) ProcessDomainRetention(ctx context.Context, domainID string) (*models.RetentionSummary, error) {
	startTime := time.Now()
	summary := &models.RetentionSummary{
		DomainID: domainID,
	}

	// Get all policies for the domain
	policies, err := s.GetPoliciesForDomain(ctx, domainID)
	if err != nil {
		return nil, err
	}

	if len(policies) == 0 {
		s.logger.Debug().Str("domain_id", domainID).Msg("No retention policies for domain")
		return summary, nil
	}

	// Get messages from storage that may be candidates
	// This would typically query a message metadata database
	candidates, err := s.getRetentionCandidates(ctx, domainID, policies)
	if err != nil {
		return nil, fmt.Errorf("failed to get retention candidates: %w", err)
	}

	summary.TotalMessages = int64(len(candidates))

	// Process each candidate
	for _, candidate := range candidates {
		// Check if under legal hold
		underHold, err := s.IsUnderLegalHold(ctx, "", domainID, candidate.UserID, candidate.MessageDate)
		if err != nil {
			s.logger.Error().Err(err).Str("message_id", candidate.MessageID).Msg("Failed to check legal hold")
			summary.Failed++
			continue
		}
		if underHold {
			summary.Skipped++
			continue
		}

		// Check if message should be expired
		match, err := s.CheckMessageExpiration(ctx, candidate)
		if err != nil || match == nil {
			summary.Skipped++
			continue
		}

		// Apply retention action
		result := s.applyRetentionAction(ctx, candidate, match)
		if !result.Success {
			summary.Failed++
			s.logger.Error().
				Str("message_id", candidate.MessageID).
				Str("error", result.Error).
				Msg("Failed to apply retention action")
			continue
		}

		summary.Processed++
		summary.BytesReclaimed += candidate.Size

		switch match.Action {
		case models.RetentionActionDelete:
			summary.Deleted++
		case models.RetentionActionArchive:
			summary.Archived++
		}
	}

	summary.Duration = time.Since(startTime)

	s.logger.Info().
		Str("domain_id", domainID).
		Int64("total", summary.TotalMessages).
		Int64("processed", summary.Processed).
		Int64("deleted", summary.Deleted).
		Int64("archived", summary.Archived).
		Int64("skipped", summary.Skipped).
		Int64("failed", summary.Failed).
		Int64("bytes_reclaimed", summary.BytesReclaimed).
		Dur("duration", summary.Duration).
		Msg("Completed domain retention processing")

	return summary, nil
}

// ProcessAllRetention processes retention for all domains
func (s *Service) ProcessAllRetention(ctx context.Context) ([]*models.RetentionSummary, error) {
	// Get all domains with retention policies
	query := `SELECT DISTINCT domain_id FROM retention_policies WHERE enabled = true`
	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get domains with retention policies: %w", err)
	}
	defer rows.Close()

	var domainIDs []string
	for rows.Next() {
		var domainID string
		if err := rows.Scan(&domainID); err != nil {
			return nil, err
		}
		domainIDs = append(domainIDs, domainID)
	}

	var summaries []*models.RetentionSummary
	for _, domainID := range domainIDs {
		summary, err := s.ProcessDomainRetention(ctx, domainID)
		if err != nil {
			s.logger.Error().Err(err).Str("domain_id", domainID).Msg("Failed to process retention")
			continue
		}
		summaries = append(summaries, summary)
	}

	return summaries, nil
}

// CreateLegalHold creates a legal hold
func (s *Service) CreateLegalHold(ctx context.Context, hold *models.LegalHold) error {
	if hold.ID == "" {
		hold.ID = uuid.New().String()
	}
	hold.CreatedAt = time.Now()
	hold.UpdatedAt = time.Now()

	query := `
		INSERT INTO legal_holds (
			id, org_id, domain_id, user_id, name, description,
			start_date, end_date, keywords, active, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
	`

	_, err := s.db.Exec(ctx, query,
		hold.ID,
		hold.OrgID,
		nullString(hold.DomainID),
		nullString(hold.UserID),
		hold.Name,
		hold.Description,
		hold.StartDate,
		hold.EndDate,
		hold.Keywords,
		hold.Active,
		hold.CreatedBy,
		hold.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create legal hold: %w", err)
	}

	s.logger.Info().
		Str("id", hold.ID).
		Str("name", hold.Name).
		Str("org_id", hold.OrgID).
		Msg("Created legal hold")

	return nil
}

// GetLegalHolds retrieves all legal holds for an organization
func (s *Service) GetLegalHolds(ctx context.Context, orgID string) ([]*models.LegalHold, error) {
	query := `
		SELECT id, org_id, domain_id, user_id, name, description,
		       start_date, end_date, keywords, active, created_by, created_at, updated_at
		FROM legal_holds
		WHERE org_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to get legal holds: %w", err)
	}
	defer rows.Close()

	var holds []*models.LegalHold
	for rows.Next() {
		var hold models.LegalHold
		var domainID, userID *string
		err := rows.Scan(
			&hold.ID,
			&hold.OrgID,
			&domainID,
			&userID,
			&hold.Name,
			&hold.Description,
			&hold.StartDate,
			&hold.EndDate,
			&hold.Keywords,
			&hold.Active,
			&hold.CreatedBy,
			&hold.CreatedAt,
			&hold.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan legal hold: %w", err)
		}
		if domainID != nil {
			hold.DomainID = *domainID
		}
		if userID != nil {
			hold.UserID = *userID
		}
		holds = append(holds, &hold)
	}

	return holds, nil
}

// IsUnderLegalHold checks if a message is under any legal hold
func (s *Service) IsUnderLegalHold(ctx context.Context, orgID, domainID, userID string, messageDate time.Time) (bool, error) {
	query := `
		SELECT COUNT(*) FROM legal_holds
		WHERE org_id = $1
		  AND active = true
		  AND start_date <= $2
		  AND (end_date IS NULL OR end_date >= $2)
		  AND (domain_id IS NULL OR domain_id = $3)
		  AND (user_id IS NULL OR user_id = $4)
	`

	var count int
	err := s.db.QueryRow(ctx, query, orgID, messageDate, domainID, userID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check legal hold: %w", err)
	}

	return count > 0, nil
}

// ReleaseLegalHold releases a legal hold
func (s *Service) ReleaseLegalHold(ctx context.Context, holdID string) error {
	query := `UPDATE legal_holds SET active = false, updated_at = $1 WHERE id = $2`
	_, err := s.db.Exec(ctx, query, time.Now(), holdID)
	if err != nil {
		return fmt.Errorf("failed to release legal hold: %w", err)
	}

	s.logger.Info().Str("hold_id", holdID).Msg("Released legal hold")
	return nil
}

// getRetentionCandidates retrieves messages that may be subject to retention
func (s *Service) getRetentionCandidates(ctx context.Context, domainID string, policies []*models.RetentionPolicy) ([]*models.RetentionCandidate, error) {
	// Find the minimum retention days to determine the cutoff date
	minDays := 365 * 10 // Default to 10 years
	for _, p := range policies {
		if p.RetentionDays < minDays {
			minDays = p.RetentionDays
		}
	}

	cutoffDate := time.Now().AddDate(0, 0, -minDays)

	query := `
		SELECT m.id, m.storage_key, m.org_id, m.domain_id, m.user_id, m.mailbox_id,
		       m.folder_id, m.folder_type, m.message_date, m.size, m.is_starred, m.labels
		FROM message_metadata m
		WHERE m.domain_id = $1 AND m.message_date < $2
		ORDER BY m.message_date ASC
		LIMIT $3
	`

	rows, err := s.db.Query(ctx, query, domainID, cutoffDate, s.cfg.RetentionBatchSize)
	if err != nil {
		return nil, fmt.Errorf("failed to query retention candidates: %w", err)
	}
	defer rows.Close()

	var candidates []*models.RetentionCandidate
	for rows.Next() {
		var c models.RetentionCandidate
		err := rows.Scan(
			&c.MessageID,
			&c.StorageKey,
			&c.OrgID,
			&c.DomainID,
			&c.UserID,
			&c.MailboxID,
			&c.FolderID,
			&c.FolderType,
			&c.MessageDate,
			&c.Size,
			&c.IsStarred,
			&c.Labels,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan retention candidate: %w", err)
		}
		candidates = append(candidates, &c)
	}

	return candidates, nil
}

// applyRetentionAction applies the retention action to a message
func (s *Service) applyRetentionAction(ctx context.Context, candidate *models.RetentionCandidate, match *models.RetentionPolicyMatch) *models.RetentionResult {
	result := &models.RetentionResult{
		MessageID:   candidate.MessageID,
		Action:      match.Action,
		ProcessedAt: time.Now(),
	}

	switch match.Action {
	case models.RetentionActionDelete:
		if err := s.storage.DeleteMessage(ctx, candidate.OrgID, candidate.DomainID, candidate.UserID, candidate.MessageID); err != nil {
			result.Success = false
			result.Error = err.Error()
			return result
		}
		// Update quota
		if s.quotaSvc != nil {
			if err := s.quotaSvc.UpdateUsage(ctx, candidate.MailboxID, -candidate.Size); err != nil {
				s.logger.Error().Err(err).Str("mailbox_id", candidate.MailboxID).Msg("Failed to update quota after retention delete")
			}
		}

	case models.RetentionActionArchive:
		// Create archive key
		archiveKey := models.StorageKey{
			OrgID:     candidate.OrgID,
			DomainID:  candidate.DomainID,
			UserID:    candidate.UserID,
			Type:      models.StorageTypeArchive,
			Year:      candidate.MessageDate.Year(),
			Month:     int(candidate.MessageDate.Month()),
			MessageID: candidate.MessageID,
		}

		// Move to archive
		if err := s.storage.Move(ctx, candidate.StorageKey, archiveKey.String()); err != nil {
			result.Success = false
			result.Error = err.Error()
			return result
		}
		result.NewStorageKey = archiveKey.String()
	}

	result.Success = true
	return result
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}
