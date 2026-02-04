package quota

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/oonrumail/storage/config"
	"github.com/oonrumail/storage/models"
	"github.com/oonrumail/storage/storage"
)

// Service implements the QuotaService interface
type Service struct {
	db           *pgxpool.Pool
	cfg          *config.Config
	logger       zerolog.Logger
	reservations sync.Map // reservationID -> *Reservation
}

// Reservation represents a pending quota reservation
type Reservation struct {
	ID         string
	MailboxID  string
	Bytes      int64
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

// NewService creates a new quota service
func NewService(db *pgxpool.Pool, cfg *config.Config, logger zerolog.Logger) *Service {
	svc := &Service{
		db:     db,
		cfg:    cfg,
		logger: logger.With().Str("component", "quota_service").Logger(),
	}

	// Start reservation cleanup goroutine
	go svc.cleanupExpiredReservations()

	return svc
}

// Ensure Service implements QuotaService
var _ storage.QuotaService = (*Service)(nil)

// GetOrganizationQuota retrieves quota for an organization
func (s *Service) GetOrganizationQuota(ctx context.Context, orgID string) (*models.Quota, error) {
	return s.getQuota(ctx, models.QuotaLevelOrganization, orgID)
}

// GetDomainQuota retrieves quota for a domain
func (s *Service) GetDomainQuota(ctx context.Context, domainID string) (*models.Quota, error) {
	return s.getQuota(ctx, models.QuotaLevelDomain, domainID)
}

// GetUserQuota retrieves quota for a user
func (s *Service) GetUserQuota(ctx context.Context, userID string) (*models.Quota, error) {
	return s.getQuota(ctx, models.QuotaLevelUser, userID)
}

// GetMailboxQuota retrieves quota for a mailbox
func (s *Service) GetMailboxQuota(ctx context.Context, mailboxID string) (*models.Quota, error) {
	return s.getQuota(ctx, models.QuotaLevelMailbox, mailboxID)
}

func (s *Service) getQuota(ctx context.Context, level models.QuotaLevel, entityID string) (*models.Quota, error) {
	query := `
		SELECT id, level, entity_id, parent_id, total_bytes, used_bytes, reserved_bytes,
		       soft_limit_pct, hard_limit_pct, created_at, updated_at
		FROM quotas
		WHERE level = $1 AND entity_id = $2
	`

	var quota models.Quota
	var parentID *string
	err := s.db.QueryRow(ctx, query, level, entityID).Scan(
		&quota.ID,
		&quota.Level,
		&quota.EntityID,
		&parentID,
		&quota.TotalBytes,
		&quota.UsedBytes,
		&quota.ReservedBytes,
		&quota.SoftLimitPct,
		&quota.HardLimitPct,
		&quota.CreatedAt,
		&quota.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get quota: %w", err)
	}

	if parentID != nil {
		quota.ParentID = *parentID
	}

	return &quota, nil
}

// CreateQuota creates a new quota
func (s *Service) CreateQuota(ctx context.Context, req *models.CreateQuotaRequest) (*models.Quota, error) {
	// Set defaults
	softLimitPct := req.SoftLimitPct
	if softLimitPct == 0 {
		softLimitPct = s.cfg.QuotaWarningPercent
	}
	hardLimitPct := req.HardLimitPct
	if hardLimitPct == 0 {
		hardLimitPct = 100
	}

	// Set default total bytes based on level
	totalBytes := req.TotalBytes
	if totalBytes == 0 {
		switch req.Level {
		case models.QuotaLevelOrganization:
			totalBytes = s.cfg.DefaultOrgQuota
		case models.QuotaLevelDomain:
			totalBytes = s.cfg.DefaultDomainQuota
		case models.QuotaLevelUser:
			totalBytes = s.cfg.DefaultUserQuota
		case models.QuotaLevelMailbox:
			totalBytes = s.cfg.DefaultMailboxQuota
		}
	}

	id := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO quotas (id, level, entity_id, parent_id, total_bytes, used_bytes, reserved_bytes,
		                    soft_limit_pct, hard_limit_pct, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, $8)
		RETURNING id
	`

	var parentID *string
	if req.ParentID != "" {
		parentID = &req.ParentID
	}

	_, err := s.db.Exec(ctx, query,
		id,
		req.Level,
		req.EntityID,
		parentID,
		totalBytes,
		softLimitPct,
		hardLimitPct,
		now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create quota: %w", err)
	}

	s.logger.Info().
		Str("id", id).
		Str("level", string(req.Level)).
		Str("entity_id", req.EntityID).
		Int64("total_bytes", totalBytes).
		Msg("Created quota")

	return &models.Quota{
		ID:           id,
		Level:        req.Level,
		EntityID:     req.EntityID,
		ParentID:     req.ParentID,
		TotalBytes:   totalBytes,
		UsedBytes:    0,
		ReservedBytes: 0,
		SoftLimitPct: softLimitPct,
		HardLimitPct: hardLimitPct,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// UpdateQuota updates an existing quota
func (s *Service) UpdateQuota(ctx context.Context, quotaID string, req *models.UpdateQuotaRequest) (*models.Quota, error) {
	// Build dynamic update query
	updates := []string{}
	args := []interface{}{}
	argNum := 1

	if req.TotalBytes != nil {
		updates = append(updates, fmt.Sprintf("total_bytes = $%d", argNum))
		args = append(args, *req.TotalBytes)
		argNum++
	}
	if req.SoftLimitPct != nil {
		updates = append(updates, fmt.Sprintf("soft_limit_pct = $%d", argNum))
		args = append(args, *req.SoftLimitPct)
		argNum++
	}
	if req.HardLimitPct != nil {
		updates = append(updates, fmt.Sprintf("hard_limit_pct = $%d", argNum))
		args = append(args, *req.HardLimitPct)
		argNum++
	}

	if len(updates) == 0 {
		return s.getQuotaByID(ctx, quotaID)
	}

	updates = append(updates, fmt.Sprintf("updated_at = $%d", argNum))
	args = append(args, time.Now())
	argNum++

	args = append(args, quotaID)

	query := fmt.Sprintf(`
		UPDATE quotas SET %s WHERE id = $%d
	`, joinStrings(updates, ", "), argNum)

	_, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update quota: %w", err)
	}

	return s.getQuotaByID(ctx, quotaID)
}

// DeleteQuota deletes a quota
func (s *Service) DeleteQuota(ctx context.Context, quotaID string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM quotas WHERE id = $1", quotaID)
	return err
}

// CheckQuota performs hierarchical quota check from mailbox up to organization
func (s *Service) CheckQuota(ctx context.Context, mailboxID string, additionalBytes int64) (*models.QuotaCheckResult, error) {
	// Get mailbox quota
	mailboxQuota, err := s.GetMailboxQuota(ctx, mailboxID)
	if err != nil {
		// If no mailbox quota exists, try to get higher level quotas
		s.logger.Debug().Str("mailbox_id", mailboxID).Msg("No mailbox quota found, checking parent quotas")
	} else {
		if !mailboxQuota.CanAccommodate(additionalBytes) {
			return &models.QuotaCheckResult{
				Allowed:        false,
				Status:         mailboxQuota.GetStatus(),
				Level:          models.QuotaLevelMailbox,
				EntityID:       mailboxID,
				AvailableBytes: mailboxQuota.AvailableBytes(),
				RequiredBytes:  additionalBytes,
				Message:        "Mailbox quota exceeded",
			}, nil
		}
	}

	// Check parent quotas if they exist
	if mailboxQuota != nil && mailboxQuota.ParentID != "" {
		return s.checkParentQuotas(ctx, mailboxQuota.ParentID, additionalBytes)
	}

	// All checks passed
	availableBytes := int64(0)
	if mailboxQuota != nil {
		availableBytes = mailboxQuota.AvailableBytes()
	}

	return &models.QuotaCheckResult{
		Allowed:        true,
		Status:         models.QuotaStatusOK,
		Level:          models.QuotaLevelMailbox,
		EntityID:       mailboxID,
		AvailableBytes: availableBytes,
		RequiredBytes:  additionalBytes,
	}, nil
}

func (s *Service) checkParentQuotas(ctx context.Context, parentID string, additionalBytes int64) (*models.QuotaCheckResult, error) {
	quota, err := s.getQuotaByID(ctx, parentID)
	if err != nil {
		return nil, err
	}

	if !quota.CanAccommodate(additionalBytes) {
		return &models.QuotaCheckResult{
			Allowed:        false,
			Status:         quota.GetStatus(),
			Level:          quota.Level,
			EntityID:       quota.EntityID,
			AvailableBytes: quota.AvailableBytes(),
			RequiredBytes:  additionalBytes,
			Message:        fmt.Sprintf("%s quota exceeded", quota.Level),
		}, nil
	}

	// Check parent's parent if exists
	if quota.ParentID != "" {
		return s.checkParentQuotas(ctx, quota.ParentID, additionalBytes)
	}

	return &models.QuotaCheckResult{
		Allowed:        true,
		Status:         quota.GetStatus(),
		Level:          quota.Level,
		EntityID:       quota.EntityID,
		AvailableBytes: quota.AvailableBytes(),
		RequiredBytes:  additionalBytes,
	}, nil
}

// CheckDomainQuota checks quota at domain level
func (s *Service) CheckDomainQuota(ctx context.Context, domainID string, additionalBytes int64) (*models.QuotaCheckResult, error) {
	domainQuota, err := s.GetDomainQuota(ctx, domainID)
	if err != nil {
		return &models.QuotaCheckResult{
			Allowed:        true,
			Status:         models.QuotaStatusOK,
			Level:          models.QuotaLevelDomain,
			EntityID:       domainID,
			RequiredBytes:  additionalBytes,
			Message:        "No domain quota configured",
		}, nil
	}

	if !domainQuota.CanAccommodate(additionalBytes) {
		return &models.QuotaCheckResult{
			Allowed:        false,
			Status:         domainQuota.GetStatus(),
			Level:          models.QuotaLevelDomain,
			EntityID:       domainID,
			AvailableBytes: domainQuota.AvailableBytes(),
			RequiredBytes:  additionalBytes,
			Message:        "Domain quota exceeded",
		}, nil
	}

	// Check organization quota
	if domainQuota.ParentID != "" {
		return s.checkParentQuotas(ctx, domainQuota.ParentID, additionalBytes)
	}

	return &models.QuotaCheckResult{
		Allowed:        true,
		Status:         domainQuota.GetStatus(),
		Level:          models.QuotaLevelDomain,
		EntityID:       domainID,
		AvailableBytes: domainQuota.AvailableBytes(),
		RequiredBytes:  additionalBytes,
	}, nil
}

// UpdateUsage updates quota usage
func (s *Service) UpdateUsage(ctx context.Context, mailboxID string, deltaBytes int64) error {
	// Update mailbox quota
	query := `
		UPDATE quotas 
		SET used_bytes = GREATEST(0, used_bytes + $1), updated_at = $2
		WHERE level = 'mailbox' AND entity_id = $3
		RETURNING parent_id
	`

	var parentID *string
	err := s.db.QueryRow(ctx, query, deltaBytes, time.Now(), mailboxID).Scan(&parentID)
	if err != nil {
		s.logger.Debug().Str("mailbox_id", mailboxID).Msg("No mailbox quota to update")
		return nil
	}

	// Update parent quotas
	if parentID != nil && *parentID != "" {
		return s.updateParentUsage(ctx, *parentID, deltaBytes)
	}

	return nil
}

func (s *Service) updateParentUsage(ctx context.Context, quotaID string, deltaBytes int64) error {
	query := `
		UPDATE quotas 
		SET used_bytes = GREATEST(0, used_bytes + $1), updated_at = $2
		WHERE id = $3
		RETURNING parent_id
	`

	var parentID *string
	err := s.db.QueryRow(ctx, query, deltaBytes, time.Now(), quotaID).Scan(&parentID)
	if err != nil {
		return nil
	}

	if parentID != nil && *parentID != "" {
		return s.updateParentUsage(ctx, *parentID, deltaBytes)
	}

	return nil
}

// RecalculateUsage recalculates usage for a mailbox from storage
func (s *Service) RecalculateUsage(ctx context.Context, mailboxID string) error {
	// This would need to query the actual storage to calculate real usage
	// For now, we just log that this was requested
	s.logger.Info().Str("mailbox_id", mailboxID).Msg("Recalculate usage requested")
	return nil
}

// RecalculateDomainUsage recalculates usage for a domain
func (s *Service) RecalculateDomainUsage(ctx context.Context, domainID string) error {
	s.logger.Info().Str("domain_id", domainID).Msg("Recalculate domain usage requested")
	return nil
}

// GetQuotaInfo returns detailed quota information
func (s *Service) GetQuotaInfo(ctx context.Context, mailboxID string) (*models.QuotaInfo, error) {
	quota, err := s.GetMailboxQuota(ctx, mailboxID)
	if err != nil {
		return nil, err
	}

	info := &models.QuotaInfo{
		Quota:          quota,
		Status:         quota.GetStatus(),
		AvailableBytes: quota.AvailableBytes(),
		UsagePercent:   quota.UsagePercent(),
	}

	// Get parent quota info if exists
	if quota.ParentID != "" {
		parentQuota, err := s.getQuotaByID(ctx, quota.ParentID)
		if err == nil {
			info.ParentQuota = &models.QuotaInfo{
				Quota:          parentQuota,
				Status:         parentQuota.GetStatus(),
				AvailableBytes: parentQuota.AvailableBytes(),
				UsagePercent:   parentQuota.UsagePercent(),
			}
		}
	}

	return info, nil
}

// GetDomainQuotaInfo returns detailed quota information for a domain
func (s *Service) GetDomainQuotaInfo(ctx context.Context, domainID string) (*models.QuotaInfo, error) {
	quota, err := s.GetDomainQuota(ctx, domainID)
	if err != nil {
		return nil, err
	}

	info := &models.QuotaInfo{
		Quota:          quota,
		Status:         quota.GetStatus(),
		AvailableBytes: quota.AvailableBytes(),
		UsagePercent:   quota.UsagePercent(),
	}

	if quota.ParentID != "" {
		parentQuota, err := s.getQuotaByID(ctx, quota.ParentID)
		if err == nil {
			info.ParentQuota = &models.QuotaInfo{
				Quota:          parentQuota,
				Status:         parentQuota.GetStatus(),
				AvailableBytes: parentQuota.AvailableBytes(),
				UsagePercent:   parentQuota.UsagePercent(),
			}
		}
	}

	return info, nil
}

// ReserveQuota reserves quota for a pending operation
func (s *Service) ReserveQuota(ctx context.Context, mailboxID string, bytes int64) (string, error) {
	// Check if there's enough quota
	result, err := s.CheckQuota(ctx, mailboxID, bytes)
	if err != nil {
		return "", err
	}
	if !result.Allowed {
		return "", fmt.Errorf("insufficient quota: %s", result.Message)
	}

	// Create reservation
	reservationID := uuid.New().String()
	reservation := &Reservation{
		ID:        reservationID,
		MailboxID: mailboxID,
		Bytes:     bytes,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(15 * time.Minute), // Reservations expire after 15 minutes
	}

	s.reservations.Store(reservationID, reservation)

	// Update reserved bytes in quota
	query := `
		UPDATE quotas 
		SET reserved_bytes = reserved_bytes + $1, updated_at = $2
		WHERE level = 'mailbox' AND entity_id = $3
	`
	_, err = s.db.Exec(ctx, query, bytes, time.Now(), mailboxID)
	if err != nil {
		s.reservations.Delete(reservationID)
		return "", fmt.Errorf("failed to reserve quota: %w", err)
	}

	s.logger.Debug().
		Str("reservation_id", reservationID).
		Str("mailbox_id", mailboxID).
		Int64("bytes", bytes).
		Msg("Created quota reservation")

	return reservationID, nil
}

// ReleaseReservation releases a quota reservation without committing
func (s *Service) ReleaseReservation(ctx context.Context, reservationID string) error {
	reservationVal, ok := s.reservations.Load(reservationID)
	if !ok {
		return fmt.Errorf("reservation not found: %s", reservationID)
	}

	reservation := reservationVal.(*Reservation)
	s.reservations.Delete(reservationID)

	// Update reserved bytes in quota
	query := `
		UPDATE quotas 
		SET reserved_bytes = GREATEST(0, reserved_bytes - $1), updated_at = $2
		WHERE level = 'mailbox' AND entity_id = $3
	`
	_, err := s.db.Exec(ctx, query, reservation.Bytes, time.Now(), reservation.MailboxID)
	if err != nil {
		return fmt.Errorf("failed to release reservation: %w", err)
	}

	s.logger.Debug().
		Str("reservation_id", reservationID).
		Msg("Released quota reservation")

	return nil
}

// CommitReservation commits a reservation (converts reserved to used)
func (s *Service) CommitReservation(ctx context.Context, reservationID string) error {
	reservationVal, ok := s.reservations.Load(reservationID)
	if !ok {
		return fmt.Errorf("reservation not found: %s", reservationID)
	}

	reservation := reservationVal.(*Reservation)
	s.reservations.Delete(reservationID)

	// Convert reserved to used
	query := `
		UPDATE quotas 
		SET reserved_bytes = GREATEST(0, reserved_bytes - $1),
		    used_bytes = used_bytes + $1,
		    updated_at = $2
		WHERE level = 'mailbox' AND entity_id = $3
	`
	_, err := s.db.Exec(ctx, query, reservation.Bytes, time.Now(), reservation.MailboxID)
	if err != nil {
		return fmt.Errorf("failed to commit reservation: %w", err)
	}

	s.logger.Debug().
		Str("reservation_id", reservationID).
		Int64("bytes", reservation.Bytes).
		Msg("Committed quota reservation")

	return nil
}

func (s *Service) getQuotaByID(ctx context.Context, quotaID string) (*models.Quota, error) {
	query := `
		SELECT id, level, entity_id, parent_id, total_bytes, used_bytes, reserved_bytes,
		       soft_limit_pct, hard_limit_pct, created_at, updated_at
		FROM quotas
		WHERE id = $1
	`

	var quota models.Quota
	var parentID *string
	err := s.db.QueryRow(ctx, query, quotaID).Scan(
		&quota.ID,
		&quota.Level,
		&quota.EntityID,
		&parentID,
		&quota.TotalBytes,
		&quota.UsedBytes,
		&quota.ReservedBytes,
		&quota.SoftLimitPct,
		&quota.HardLimitPct,
		&quota.CreatedAt,
		&quota.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get quota: %w", err)
	}

	if parentID != nil {
		quota.ParentID = *parentID
	}

	return &quota, nil
}

func (s *Service) cleanupExpiredReservations() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		s.reservations.Range(func(key, value interface{}) bool {
			reservation := value.(*Reservation)
			if now.After(reservation.ExpiresAt) {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				if err := s.ReleaseReservation(ctx, reservation.ID); err != nil {
					s.logger.Error().Err(err).Str("reservation_id", reservation.ID).Msg("Failed to cleanup expired reservation")
				}
				cancel()
			}
			return true
		})
	}
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
