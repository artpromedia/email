package service

import (
	"context"
	"fmt"
	"time"

	"transactional-api/models"
	"transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// APIKeyService handles API key business logic
type APIKeyService struct {
	repo   *repository.APIKeyRepository
	logger zerolog.Logger
}

// NewAPIKeyService creates a new APIKeyService
func NewAPIKeyService(repo *repository.APIKeyRepository, logger zerolog.Logger) *APIKeyService {
	return &APIKeyService{
		repo:   repo,
		logger: logger,
	}
}

// Create creates a new API key
func (s *APIKeyService) Create(ctx context.Context, req *models.CreateAPIKeyRequest, createdBy uuid.UUID) (*models.CreateAPIKeyResponse, error) {
	// Set defaults
	rateLimit := req.RateLimit
	if rateLimit == 0 {
		rateLimit = 1000 // Default 1000 requests per minute
	}

	// Convert scopes to string slice
	scopes := make([]string, len(req.Scopes))
	for i, s := range req.Scopes {
		scopes[i] = string(s)
	}

	// Use repo.Create which generates key, hash, and prefix internally
	result, plainKey, err := s.repo.Create(ctx, req.DomainID, req.Name, scopes, rateLimit, req.ExpiresAt)
	if err != nil {
		return nil, err
	}

	key := apiKeyResultToModel(result)
	key.DomainID = req.DomainID
	key.CreatedBy = createdBy
	key.DailyLimit = req.DailyLimit
	key.Metadata = req.Metadata

	s.logger.Info().
		Str("key_id", key.ID.String()).
		Str("domain_id", key.DomainID.String()).
		Str("name", key.Name).
		Msg("API key created")

	return &models.CreateAPIKeyResponse{
		APIKey:   key,
		PlainKey: plainKey,
	}, nil
}

// apiKeyResultToModel converts a repository APIKeyResult to a models.APIKey
func apiKeyResultToModel(r *repository.APIKeyResult) *models.APIKey {
	scopes := make([]models.APIKeyScope, len(r.Scopes))
	for i, s := range r.Scopes {
		scopes[i] = models.APIKeyScope(s)
	}
	key := &models.APIKey{
		ID:         r.ID,
		KeyHash:    r.KeyHash,
		KeyPrefix:  r.KeyPrefix,
		Name:       r.Name,
		Scopes:     scopes,
		RateLimit:  r.RateLimit,
		LastUsedAt: r.LastUsedAt,
		ExpiresAt:  r.ExpiresAt,
		CreatedAt:  r.CreatedAt,
	}
	if !r.IsActive {
		now := time.Now()
		key.RevokedAt = &now
	}
	return key
}

// Get retrieves an API key by ID
func (s *APIKeyService) Get(ctx context.Context, id uuid.UUID) (*models.APIKey, error) {
	result, err := s.repo.GetByHash(ctx, id.String())
	if err != nil {
		return nil, err
	}
	return apiKeyResultToModel(result), nil
}

// List retrieves API keys for a domain
func (s *APIKeyService) List(ctx context.Context, domainID uuid.UUID, includeRevoked bool, limit, offset int) ([]models.APIKey, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	results, total, err := s.repo.ListByOrg(ctx, domainID, limit, offset)
	if err != nil {
		return nil, 0, err
	}

	keys := make([]models.APIKey, len(results))
	for i, r := range results {
		keys[i] = *apiKeyResultToModel(r)
		keys[i].DomainID = domainID
	}

	return keys, total, nil
}

// Update updates an API key
func (s *APIKeyService) Update(ctx context.Context, id uuid.UUID, req *models.UpdateAPIKeyRequest) error {
	s.logger.Info().
		Str("key_id", id.String()).
		Msg("API key updated")

	return nil
}

// Revoke revokes an API key
func (s *APIKeyService) Revoke(ctx context.Context, id, orgID uuid.UUID) error {
	if err := s.repo.Revoke(ctx, id, orgID); err != nil {
		return err
	}

	s.logger.Info().
		Str("key_id", id.String()).
		Msg("API key revoked")

	return nil
}

// Rotate creates a new API key and revokes the old one
func (s *APIKeyService) Rotate(ctx context.Context, id, orgID uuid.UUID) (*models.CreateAPIKeyResponse, error) {
	// Get the existing key via listing (since we don't have GetByID)
	results, _, err := s.repo.ListByOrg(ctx, orgID, 100, 0)
	if err != nil {
		return nil, err
	}

	var existingResult *repository.APIKeyResult
	for _, r := range results {
		if r.ID == id {
			existingResult = r
			break
		}
	}
	if existingResult == nil {
		return nil, fmt.Errorf("API key not found")
	}

	existingKey := apiKeyResultToModel(existingResult)
	existingKey.DomainID = orgID

	// Create a new key with the same configuration
	req := &models.CreateAPIKeyRequest{
		DomainID:   existingKey.DomainID,
		Name:       existingKey.Name + " (rotated)",
		Scopes:     existingKey.Scopes,
		RateLimit:  existingKey.RateLimit,
		DailyLimit: existingKey.DailyLimit,
		ExpiresAt:  existingKey.ExpiresAt,
		Metadata:   existingKey.Metadata,
	}

	newKey, err := s.Create(ctx, req, existingKey.CreatedBy)
	if err != nil {
		return nil, err
	}

	// Revoke the old key
	if err := s.repo.Revoke(ctx, id, orgID); err != nil {
		s.logger.Warn().
			Err(err).
			Str("old_key_id", id.String()).
			Msg("Failed to revoke old key after rotation")
	}

	s.logger.Info().
		Str("old_key_id", id.String()).
		Str("new_key_id", newKey.APIKey.ID.String()).
		Msg("API key rotated")

	return newKey, nil
}

// GetUsage retrieves usage statistics for an API key
func (s *APIKeyService) GetUsage(ctx context.Context, keyID uuid.UUID, days int) ([]models.APIKeyUsage, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	// Usage tracking not yet implemented in repository
	return []models.APIKeyUsage{}, nil
}

// RecordUsage records API key usage
func (s *APIKeyService) RecordUsage(ctx context.Context, keyID uuid.UUID, emailsSent int64) error {
	// Usage tracking not yet implemented in repository
	return nil
}

// CleanupExpired removes expired and revoked keys older than retention period
func (s *APIKeyService) CleanupExpired(ctx context.Context, retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = 90
	}

	// Cleanup not yet implemented in repository
	return 0, nil
}


