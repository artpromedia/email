package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAPIKeyNotFound = errors.New("api key not found")
	ErrAPIKeyRevoked  = errors.New("api key has been revoked")
	ErrAPIKeyExpired  = errors.New("api key has expired")
)

// APIKeyRepository handles database operations for API keys
type APIKeyRepository struct {
	pool *pgxpool.Pool
}

// NewAPIKeyRepository creates a new APIKeyRepository
func NewAPIKeyRepository(pool *pgxpool.Pool) *APIKeyRepository {
	return &APIKeyRepository{pool: pool}
}

// HashAPIKey creates a SHA-256 hash of the API key
func HashAPIKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// Create creates a new API key in the database
func (r *APIKeyRepository) Create(ctx context.Context, key *models.APIKey) error {
	query := `
		INSERT INTO api_keys (
			id, domain_id, key_hash, key_prefix, name, scopes,
			rate_limit, daily_limit, expires_at, created_by, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`

	_, err := r.pool.Exec(ctx, query,
		key.ID,
		key.DomainID,
		key.KeyHash,
		key.KeyPrefix,
		key.Name,
		key.Scopes,
		key.RateLimit,
		key.DailyLimit,
		key.ExpiresAt,
		key.CreatedBy,
		key.Metadata,
	)

	return err
}

// GetByHash retrieves an API key by its hash
func (r *APIKeyRepository) GetByHash(ctx context.Context, keyHash string) (*models.APIKey, error) {
	query := `
		SELECT id, domain_id, key_hash, key_prefix, name, scopes,
		       rate_limit, daily_limit, last_used_at, expires_at,
		       created_at, revoked_at, created_by, metadata
		FROM api_keys
		WHERE key_hash = $1
	`

	var key models.APIKey
	err := r.pool.QueryRow(ctx, query, keyHash).Scan(
		&key.ID,
		&key.DomainID,
		&key.KeyHash,
		&key.KeyPrefix,
		&key.Name,
		&key.Scopes,
		&key.RateLimit,
		&key.DailyLimit,
		&key.LastUsedAt,
		&key.ExpiresAt,
		&key.CreatedAt,
		&key.RevokedAt,
		&key.CreatedBy,
		&key.Metadata,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAPIKeyNotFound
	}
	if err != nil {
		return nil, err
	}

	return &key, nil
}

// GetByID retrieves an API key by ID
func (r *APIKeyRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.APIKey, error) {
	query := `
		SELECT id, domain_id, key_hash, key_prefix, name, scopes,
		       rate_limit, daily_limit, last_used_at, expires_at,
		       created_at, revoked_at, created_by, metadata
		FROM api_keys
		WHERE id = $1
	`

	var key models.APIKey
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&key.ID,
		&key.DomainID,
		&key.KeyHash,
		&key.KeyPrefix,
		&key.Name,
		&key.Scopes,
		&key.RateLimit,
		&key.DailyLimit,
		&key.LastUsedAt,
		&key.ExpiresAt,
		&key.CreatedAt,
		&key.RevokedAt,
		&key.CreatedBy,
		&key.Metadata,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAPIKeyNotFound
	}
	if err != nil {
		return nil, err
	}

	return &key, nil
}

// List retrieves API keys for a domain
func (r *APIKeyRepository) List(ctx context.Context, req *models.ListAPIKeysRequest) ([]models.APIKey, int64, error) {
	// Count query
	countQuery := `
		SELECT COUNT(*)
		FROM api_keys
		WHERE domain_id = $1
	`
	args := []any{req.DomainID}

	if !req.IncludeRevoked {
		countQuery += " AND revoked_at IS NULL"
	}

	var total int64
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Data query
	query := `
		SELECT id, domain_id, key_hash, key_prefix, name, scopes,
		       rate_limit, daily_limit, last_used_at, expires_at,
		       created_at, revoked_at, created_by, metadata
		FROM api_keys
		WHERE domain_id = $1
	`

	if !req.IncludeRevoked {
		query += " AND revoked_at IS NULL"
	}

	query += " ORDER BY created_at DESC LIMIT $2 OFFSET $3"
	args = append(args, req.Limit, req.Offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		var key models.APIKey
		err := rows.Scan(
			&key.ID,
			&key.DomainID,
			&key.KeyHash,
			&key.KeyPrefix,
			&key.Name,
			&key.Scopes,
			&key.RateLimit,
			&key.DailyLimit,
			&key.LastUsedAt,
			&key.ExpiresAt,
			&key.CreatedAt,
			&key.RevokedAt,
			&key.CreatedBy,
			&key.Metadata,
		)
		if err != nil {
			return nil, 0, err
		}
		keys = append(keys, key)
	}

	return keys, total, nil
}

// Update updates an API key
func (r *APIKeyRepository) Update(ctx context.Context, id uuid.UUID, req *models.UpdateAPIKeyRequest) error {
	query := `
		UPDATE api_keys
		SET name = COALESCE($2, name),
		    scopes = COALESCE($3, scopes),
		    rate_limit = COALESCE($4, rate_limit),
		    daily_limit = COALESCE($5, daily_limit),
		    expires_at = COALESCE($6, expires_at),
		    metadata = COALESCE($7, metadata)
		WHERE id = $1 AND revoked_at IS NULL
	`

	var scopesArg any
	if req.Scopes != nil {
		scopesArg = req.Scopes
	}

	result, err := r.pool.Exec(ctx, query,
		id,
		req.Name,
		scopesArg,
		req.RateLimit,
		req.DailyLimit,
		req.ExpiresAt,
		req.Metadata,
	)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrAPIKeyNotFound
	}

	return nil
}

// Revoke revokes an API key
func (r *APIKeyRepository) Revoke(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE api_keys
		SET revoked_at = NOW()
		WHERE id = $1 AND revoked_at IS NULL
	`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrAPIKeyNotFound
	}

	return nil
}

// UpdateLastUsed updates the last_used_at timestamp
func (r *APIKeyRepository) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE api_keys
		SET last_used_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// RecordUsage records API key usage for a specific date
func (r *APIKeyRepository) RecordUsage(ctx context.Context, keyID uuid.UUID, emailsSent int64) error {
	query := `
		INSERT INTO api_key_usage (key_id, date, request_count, emails_sent, last_request_at)
		VALUES ($1, CURRENT_DATE, 1, $2, NOW())
		ON CONFLICT (key_id, date)
		DO UPDATE SET
			request_count = api_key_usage.request_count + 1,
			emails_sent = api_key_usage.emails_sent + $2,
			last_request_at = NOW(),
			updated_at = NOW()
	`

	_, err := r.pool.Exec(ctx, query, keyID, emailsSent)
	return err
}

// GetUsage retrieves usage statistics for an API key
func (r *APIKeyRepository) GetUsage(ctx context.Context, keyID uuid.UUID, startDate, endDate time.Time) ([]models.APIKeyUsage, error) {
	query := `
		SELECT key_id, date, request_count, emails_sent, emails_delivered, emails_bounced, last_request_at
		FROM api_key_usage
		WHERE key_id = $1 AND date >= $2 AND date <= $3
		ORDER BY date DESC
	`

	rows, err := r.pool.Query(ctx, query, keyID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var usage []models.APIKeyUsage
	for rows.Next() {
		var u models.APIKeyUsage
		err := rows.Scan(
			&u.KeyID,
			&u.Date,
			&u.RequestCount,
			&u.EmailsSent,
			&u.EmailsDelivered,
			&u.EmailsBounced,
			&u.LastRequestAt,
		)
		if err != nil {
			return nil, err
		}
		usage = append(usage, u)
	}

	return usage, nil
}

// GetTodayUsage retrieves today's usage for rate limiting
func (r *APIKeyRepository) GetTodayUsage(ctx context.Context, keyID uuid.UUID) (int64, error) {
	query := `
		SELECT COALESCE(request_count, 0)
		FROM api_key_usage
		WHERE key_id = $1 AND date = CURRENT_DATE
	`

	var count int64
	err := r.pool.QueryRow(ctx, query, keyID).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}

	return count, nil
}

// DeleteExpiredKeys removes expired and revoked keys older than retention period
func (r *APIKeyRepository) DeleteExpiredKeys(ctx context.Context, retentionDays int) (int64, error) {
	query := `
		DELETE FROM api_keys
		WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day' * $1)
		   OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 day' * $1)
	`

	result, err := r.pool.Exec(ctx, query, retentionDays)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected(), nil
}
