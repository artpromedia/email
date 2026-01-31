package service

import (
	"context"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// SuppressionService handles suppression list business logic
type SuppressionService struct {
	repo   *repository.SuppressionRepository
	logger zerolog.Logger
}

// NewSuppressionService creates a new SuppressionService
func NewSuppressionService(repo *repository.SuppressionRepository, logger zerolog.Logger) *SuppressionService {
	return &SuppressionService{
		repo:   repo,
		logger: logger,
	}
}

// Add adds an email to the suppression list
func (s *SuppressionService) Add(ctx context.Context, domainID uuid.UUID, req *models.CreateSuppressionRequest, createdBy *uuid.UUID) (*models.Suppression, error) {
	suppression := &models.Suppression{
		ID:          uuid.New(),
		DomainID:    domainID,
		Email:       req.Email,
		Reason:      req.Reason,
		BounceClass: req.BounceClass,
		Description: req.Description,
		Source:      "api",
		ExpiresAt:   req.ExpiresAt,
		CreatedAt:   time.Now(),
		CreatedBy:   createdBy,
	}

	if err := s.repo.Create(ctx, suppression); err != nil {
		if err == repository.ErrSuppressionExists {
			// Return existing suppression
			existing, getErr := s.repo.GetByEmail(ctx, domainID, req.Email)
			if getErr != nil {
				return nil, err
			}
			return existing, nil
		}
		return nil, err
	}

	s.logger.Info().
		Str("email", req.Email).
		Str("reason", string(req.Reason)).
		Msg("Email added to suppression list")

	return suppression, nil
}

// AddBulk adds multiple emails to the suppression list
func (s *SuppressionService) AddBulk(ctx context.Context, domainID uuid.UUID, req *models.BulkSuppressionRequest, createdBy *uuid.UUID) (*models.BulkSuppressionResponse, error) {
	resp, err := s.repo.CreateBulk(ctx, domainID, req.Emails, req.Reason, req.Description, createdBy)
	if err != nil {
		return nil, err
	}

	s.logger.Info().
		Int("added", resp.Added).
		Int("existing", resp.Existing).
		Str("reason", string(req.Reason)).
		Msg("Bulk suppression completed")

	return resp, nil
}

// Get retrieves suppression status for an email
func (s *SuppressionService) Get(ctx context.Context, domainID uuid.UUID, email string) (*models.Suppression, error) {
	return s.repo.GetByEmail(ctx, domainID, email)
}

// Check checks if an email is suppressed
func (s *SuppressionService) Check(ctx context.Context, domainID uuid.UUID, email string) (bool, *models.SuppressionStatus, error) {
	return s.repo.IsSuppressed(ctx, domainID, email)
}

// CheckMultiple checks suppression status for multiple emails
func (s *SuppressionService) CheckMultiple(ctx context.Context, domainID uuid.UUID, emails []string) (*models.CheckSuppressionResponse, error) {
	return s.repo.CheckMultiple(ctx, domainID, emails)
}

// List retrieves suppressions with filtering
func (s *SuppressionService) List(ctx context.Context, query *models.SuppressionQuery) (*models.SuppressionListResponse, error) {
	if query.Limit <= 0 {
		query.Limit = 20
	}
	if query.Limit > 100 {
		query.Limit = 100
	}

	return s.repo.List(ctx, query)
}

// Remove removes an email from the suppression list
func (s *SuppressionService) Remove(ctx context.Context, domainID uuid.UUID, email string) error {
	if err := s.repo.Delete(ctx, domainID, email); err != nil {
		return err
	}

	s.logger.Info().
		Str("email", email).
		Msg("Email removed from suppression list")

	return nil
}

// RemoveByID removes a suppression by ID
func (s *SuppressionService) RemoveByID(ctx context.Context, id uuid.UUID) error {
	if err := s.repo.DeleteByID(ctx, id); err != nil {
		return err
	}

	s.logger.Info().
		Str("suppression_id", id.String()).
		Msg("Suppression removed")

	return nil
}

// GetStats retrieves suppression statistics
func (s *SuppressionService) GetStats(ctx context.Context, domainID uuid.UUID) (*models.SuppressionStats, error) {
	return s.repo.GetStats(ctx, domainID)
}

// CleanupExpired removes expired suppressions
func (s *SuppressionService) CleanupExpired(ctx context.Context) (int64, error) {
	count, err := s.repo.DeleteExpired(ctx)
	if err != nil {
		return 0, err
	}

	if count > 0 {
		s.logger.Info().
			Int64("count", count).
			Msg("Cleaned up expired suppressions")
	}

	return count, nil
}

// CreateGroup creates a new unsubscribe group
func (s *SuppressionService) CreateGroup(ctx context.Context, domainID uuid.UUID, req *models.CreateUnsubscribeGroupRequest) (*models.UnsubscribeGroup, error) {
	group := &models.UnsubscribeGroup{
		ID:          uuid.New(),
		DomainID:    domainID,
		Name:        req.Name,
		Description: req.Description,
		IsDefault:   req.IsDefault,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.CreateUnsubscribeGroup(ctx, group); err != nil {
		return nil, err
	}

	s.logger.Info().
		Str("group_id", group.ID.String()).
		Str("name", group.Name).
		Msg("Unsubscribe group created")

	return group, nil
}

// GetGroups retrieves unsubscribe groups for a domain
func (s *SuppressionService) GetGroups(ctx context.Context, domainID uuid.UUID) ([]models.UnsubscribeGroup, error) {
	return s.repo.GetUnsubscribeGroups(ctx, domainID)
}

// AddToGroup adds an email to an unsubscribe group
func (s *SuppressionService) AddToGroup(ctx context.Context, groupID uuid.UUID, email string) error {
	if err := s.repo.AddToGroup(ctx, groupID, email); err != nil {
		return err
	}

	s.logger.Debug().
		Str("group_id", groupID.String()).
		Str("email", email).
		Msg("Email added to unsubscribe group")

	return nil
}

// RemoveFromGroup removes an email from an unsubscribe group
func (s *SuppressionService) RemoveFromGroup(ctx context.Context, groupID uuid.UUID, email string) error {
	if err := s.repo.RemoveFromGroup(ctx, groupID, email); err != nil {
		return err
	}

	s.logger.Debug().
		Str("group_id", groupID.String()).
		Str("email", email).
		Msg("Email removed from unsubscribe group")

	return nil
}

// IsInGroup checks if an email is in an unsubscribe group
func (s *SuppressionService) IsInGroup(ctx context.Context, groupID uuid.UUID, email string) (bool, error) {
	return s.repo.IsInGroup(ctx, groupID, email)
}

// ProcessBounce processes a bounce event and adds to suppression
func (s *SuppressionService) ProcessBounce(ctx context.Context, domainID uuid.UUID, email, bounceType, bounceCode, smtpResponse string, messageID *uuid.UUID) error {
	// Determine bounce classification
	var bounceClass models.BounceClassification
	switch bounceType {
	case "hard":
		bounceClass = models.BounceClassificationHard
	case "soft":
		bounceClass = models.BounceClassificationSoft
	case "block":
		bounceClass = models.BounceClassificationBlock
	default:
		// Analyze SMTP response to determine type
		bounceClass = classifyBounce(smtpResponse)
	}

	// Only suppress hard bounces and blocks permanently
	var expiresAt *time.Time
	if bounceClass == models.BounceClassificationSoft {
		// Soft bounces expire after 7 days
		exp := time.Now().Add(7 * 24 * time.Hour)
		expiresAt = &exp
	}

	suppression := &models.Suppression{
		ID:            uuid.New(),
		DomainID:      domainID,
		Email:         email,
		Reason:        models.SuppressionReasonBounce,
		BounceClass:   bounceClass,
		OriginalError: smtpResponse,
		Source:        "smtp",
		MessageID:     messageID,
		ExpiresAt:     expiresAt,
		CreatedAt:     time.Now(),
	}

	if err := s.repo.Create(ctx, suppression); err != nil {
		if err == repository.ErrSuppressionExists {
			// Already suppressed, ignore
			return nil
		}
		return err
	}

	s.logger.Info().
		Str("email", email).
		Str("bounce_type", bounceType).
		Str("bounce_class", string(bounceClass)).
		Msg("Bounce processed and added to suppression")

	return nil
}

// ProcessSpamComplaint processes a spam complaint and adds to suppression
func (s *SuppressionService) ProcessSpamComplaint(ctx context.Context, domainID uuid.UUID, email string, messageID *uuid.UUID) error {
	suppression := &models.Suppression{
		ID:        uuid.New(),
		DomainID:  domainID,
		Email:     email,
		Reason:    models.SuppressionReasonSpamComplaint,
		Source:    "feedback_loop",
		MessageID: messageID,
		CreatedAt: time.Now(),
	}

	if err := s.repo.Create(ctx, suppression); err != nil {
		if err == repository.ErrSuppressionExists {
			return nil
		}
		return err
	}

	s.logger.Info().
		Str("email", email).
		Msg("Spam complaint processed and added to suppression")

	return nil
}

// ProcessUnsubscribe processes an unsubscribe request
func (s *SuppressionService) ProcessUnsubscribe(ctx context.Context, domainID uuid.UUID, email string, messageID *uuid.UUID) error {
	suppression := &models.Suppression{
		ID:        uuid.New(),
		DomainID:  domainID,
		Email:     email,
		Reason:    models.SuppressionReasonUnsubscribe,
		Source:    "user",
		MessageID: messageID,
		CreatedAt: time.Now(),
	}

	if err := s.repo.Create(ctx, suppression); err != nil {
		if err == repository.ErrSuppressionExists {
			return nil
		}
		return err
	}

	s.logger.Info().
		Str("email", email).
		Msg("Unsubscribe processed and added to suppression")

	return nil
}

// classifyBounce attempts to classify a bounce from the SMTP response
func classifyBounce(smtpResponse string) models.BounceClassification {
	// Common hard bounce codes
	hardCodes := []string{"550", "551", "552", "553", "554"}
	for _, code := range hardCodes {
		if len(smtpResponse) >= 3 && smtpResponse[:3] == code {
			return models.BounceClassificationHard
		}
	}

	// Common soft bounce codes
	softCodes := []string{"421", "450", "451", "452"}
	for _, code := range softCodes {
		if len(smtpResponse) >= 3 && smtpResponse[:3] == code {
			return models.BounceClassificationSoft
		}
	}

	// Default to soft bounce
	return models.BounceClassificationSoft
}
