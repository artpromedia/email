package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type APIKeyResult struct {
	ID             uuid.UUID
	OrganizationID uuid.UUID
	Name           string
	KeyPrefix      string
	KeyHash        string
	Scopes         []string
	RateLimit      int
	IsActive       bool
	LastUsedAt     *time.Time
	ExpiresAt      *time.Time
	CreatedAt      time.Time
}

type APIKeyRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewAPIKeyRepository(db *pgxpool.Pool, logger *zap.Logger) *APIKeyRepository {
	return &APIKeyRepository{db: db, logger: logger}
}

// GenerateAPIKey generates a new API key with prefix
func (r *APIKeyRepository) GenerateAPIKey() (key string, prefix string, hash string, err error) {
	// Generate 32 random bytes
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", "", fmt.Errorf("generate random bytes: %w", err)
	}

	// Create key with prefix
	rawKey := base64.URLEncoding.EncodeToString(bytes)
	key = "em_" + rawKey // em_ prefix for "enterprise mail"
	prefix = key[:12]

	// Hash the key
	hashBytes := sha256.Sum256([]byte(key))
	hash = hex.EncodeToString(hashBytes[:])

	return key, prefix, hash, nil
}

func (r *APIKeyRepository) Create(ctx context.Context, orgID uuid.UUID, name string, scopes []string, rateLimit int, expiresAt *time.Time) (*APIKeyResult, string, error) {
	key, prefix, hash, err := r.GenerateAPIKey()
	if err != nil {
		return nil, "", fmt.Errorf("generate API key: %w", err)
	}

	id := uuid.New()
	now := time.Now()

	query := `
		INSERT INTO api_keys (id, organization_id, name, key_prefix, key_hash, scopes, rate_limit, is_active, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $9)
		RETURNING id, organization_id, name, key_prefix, key_hash, scopes, rate_limit, is_active, last_used_at, expires_at, created_at
	`

	result := &APIKeyResult{}
	err = r.db.QueryRow(ctx, query, id, orgID, name, prefix, hash, scopes, rateLimit, expiresAt, now).Scan(
		&result.ID, &result.OrganizationID, &result.Name, &result.KeyPrefix, &result.KeyHash,
		&result.Scopes, &result.RateLimit, &result.IsActive, &result.LastUsedAt, &result.ExpiresAt, &result.CreatedAt,
	)
	if err != nil {
		return nil, "", fmt.Errorf("insert API key: %w", err)
	}

	return result, key, nil
}

func (r *APIKeyRepository) GetByHash(ctx context.Context, keyHash string) (*APIKeyResult, error) {
	query := `
		SELECT id, organization_id, name, key_prefix, key_hash, scopes, rate_limit, is_active, last_used_at, expires_at, created_at
		FROM api_keys
		WHERE key_hash = $1
	`

	result := &APIKeyResult{}
	err := r.db.QueryRow(ctx, query, keyHash).Scan(
		&result.ID, &result.OrganizationID, &result.Name, &result.KeyPrefix, &result.KeyHash,
		&result.Scopes, &result.RateLimit, &result.IsActive, &result.LastUsedAt, &result.ExpiresAt, &result.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("API key not found")
	}
	if err != nil {
		return nil, fmt.Errorf("query API key: %w", err)
	}

	return result, nil
}

func (r *APIKeyRepository) ListByOrg(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*APIKeyResult, int64, error) {
	countQuery := `SELECT COUNT(*) FROM api_keys WHERE organization_id = $1`
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, orgID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count API keys: %w", err)
	}

	query := `
		SELECT id, organization_id, name, key_prefix, key_hash, scopes, rate_limit, is_active, last_used_at, expires_at, created_at
		FROM api_keys
		WHERE organization_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, orgID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query API keys: %w", err)
	}
	defer rows.Close()

	var results []*APIKeyResult
	for rows.Next() {
		result := &APIKeyResult{}
		if err := rows.Scan(
			&result.ID, &result.OrganizationID, &result.Name, &result.KeyPrefix, &result.KeyHash,
			&result.Scopes, &result.RateLimit, &result.IsActive, &result.LastUsedAt, &result.ExpiresAt, &result.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan API key: %w", err)
		}
		results = append(results, result)
	}

	return results, total, nil
}

func (r *APIKeyRepository) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE api_keys SET last_used_at = $1 WHERE id = $2`
	_, err := r.db.Exec(ctx, query, time.Now(), id)
	return err
}

func (r *APIKeyRepository) Revoke(ctx context.Context, id, orgID uuid.UUID) error {
	query := `UPDATE api_keys SET is_active = false, updated_at = $1 WHERE id = $2 AND organization_id = $3`
	result, err := r.db.Exec(ctx, query, time.Now(), id, orgID)
	if err != nil {
		return fmt.Errorf("revoke API key: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("API key not found")
	}
	return nil
}

func (r *APIKeyRepository) Delete(ctx context.Context, id, orgID uuid.UUID) error {
	query := `DELETE FROM api_keys WHERE id = $1 AND organization_id = $2`
	result, err := r.db.Exec(ctx, query, id, orgID)
	if err != nil {
		return fmt.Errorf("delete API key: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("API key not found")
	}
	return nil
}
