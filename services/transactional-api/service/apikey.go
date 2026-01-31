package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
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
	// Generate a random API key
	plainKey, err := generateAPIKey()
	if err != nil {
		return nil, err
	}

	// Hash the key for storage
	keyHash := repository.HashAPIKey(plainKey)
	keyPrefix := plainKey[:8] + "..."

	// Set defaults
	rateLimit := req.RateLimit
	if rateLimit == 0 {
		rateLimit = 1000 // Default 1000 requests per minute
	}

	dailyLimit := req.DailyLimit
	if dailyLimit == 0 {
		dailyLimit = 100000 // Default 100k requests per day
	}

	key := &models.APIKey{
		ID:         uuid.New(),
		DomainID:   req.DomainID,
		KeyHash:    keyHash,
		KeyPrefix:  keyPrefix,
		Name:       req.Name,
		Scopes:     req.Scopes,
		RateLimit:  rateLimit,
		DailyLimit: dailyLimit,
		ExpiresAt:  req.ExpiresAt,
		CreatedAt:  time.Now(),
		CreatedBy:  createdBy,
		Metadata:   req.Metadata,
	}

	if err := s.repo.Create(ctx, key); err != nil {
		return nil, err
	}

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

// Get retrieves an API key by ID
func (s *APIKeyService) Get(ctx context.Context, id uuid.UUID) (*models.APIKey, error) {
	return s.repo.GetByID(ctx, id)
}

// List retrieves API keys for a domain
func (s *APIKeyService) List(ctx context.Context, domainID uuid.UUID, includeRevoked bool, limit, offset int) ([]models.APIKey, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	req := &models.ListAPIKeysRequest{
		DomainID:       domainID,
		IncludeRevoked: includeRevoked,
		Limit:          limit,
		Offset:         offset,
	}

	return s.repo.List(ctx, req)
}

// Update updates an API key
func (s *APIKeyService) Update(ctx context.Context, id uuid.UUID, req *models.UpdateAPIKeyRequest) error {
	// Verify key exists
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.repo.Update(ctx, id, req); err != nil {
		return err
	}

	s.logger.Info().
		Str("key_id", id.String()).
		Msg("API key updated")

	return nil
}

// Revoke revokes an API key
func (s *APIKeyService) Revoke(ctx context.Context, id uuid.UUID) error {
	if err := s.repo.Revoke(ctx, id); err != nil {
		return err
	}

	s.logger.Info().
		Str("key_id", id.String()).
		Msg("API key revoked")

	return nil
}

// Rotate creates a new API key and revokes the old one
func (s *APIKeyService) Rotate(ctx context.Context, id uuid.UUID) (*models.CreateAPIKeyResponse, error) {
	// Get the existing key
	existingKey, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

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
	if err := s.repo.Revoke(ctx, id); err != nil {
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

	startDate := time.Now().AddDate(0, 0, -days)
	endDate := time.Now()

	return s.repo.GetUsage(ctx, keyID, startDate, endDate)
}

// RecordUsage records API key usage
func (s *APIKeyService) RecordUsage(ctx context.Context, keyID uuid.UUID, emailsSent int64) error {
	return s.repo.RecordUsage(ctx, keyID, emailsSent)
}

// CleanupExpired removes expired and revoked keys older than retention period
func (s *APIKeyService) CleanupExpired(ctx context.Context, retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = 90
	}

	count, err := s.repo.DeleteExpiredKeys(ctx, retentionDays)
	if err != nil {
		return 0, err
	}

	if count > 0 {
		s.logger.Info().
			Int64("count", count).
			Int("retention_days", retentionDays).
			Msg("Cleaned up expired API keys")
	}

	return count, nil
}

// generateAPIKey generates a secure random API key
func generateAPIKey() (string, error) {
	// Generate 32 random bytes (256 bits)
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	// Encode as base64 URL-safe string with prefix
	return "sk_" + base64.RawURLEncoding.EncodeToString(bytes), nil
}
