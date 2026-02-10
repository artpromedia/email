package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/auth"
)

// AuthRepository implements auth.Repository for user authentication
type AuthRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewAuthRepository creates a new auth repository
func NewAuthRepository(db *pgxpool.Pool, logger *zap.Logger) *AuthRepository {
	return &AuthRepository{
		db:     db,
		logger: logger,
	}
}

// GetUserByEmail retrieves a user by any of their email addresses
func (r *AuthRepository) GetUserByEmail(ctx context.Context, email string) (*auth.User, error) {
	query := `
		SELECT
			u.id, u.organization_id, u.email, u.display_name,
			u.password_hash, u.status,
			COALESCE(ua.domain_id, '') as domain_id,
			u.locked_until
		FROM users u
		LEFT JOIN user_addresses ua ON ua.user_id = u.id AND ua.address = $1
		WHERE u.email = $1 OR ua.address = $1
		LIMIT 1
	`

	var user auth.User
	var lockedUntil sql.NullTime
	var passwordHash sql.NullString

	err := r.db.QueryRow(ctx, query, email).Scan(
		&user.ID,
		&user.OrganizationID,
		&user.Email,
		&user.DisplayName,
		&passwordHash,
		&user.Status,
		&user.DomainID,
		&lockedUntil,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // User not found
		}
		return nil, fmt.Errorf("query user by email: %w", err)
	}

	if passwordHash.Valid {
		user.PasswordHash = passwordHash.String
	}

	if lockedUntil.Valid {
		user.LockedUntil = &lockedUntil.Time
	}

	return &user, nil
}

// UpdateLoginFailure records a failed login attempt
func (r *AuthRepository) UpdateLoginFailure(ctx context.Context, userID string) error {
	query := `
		UPDATE users
		SET
			failed_login_count = COALESCE(failed_login_count, 0) + 1,
			last_failed_login = NOW(),
			locked_until = CASE
				WHEN COALESCE(failed_login_count, 0) >= 4 THEN NOW() + INTERVAL '15 minutes'
				ELSE locked_until
			END
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("update login failure: %w", err)
	}

	return nil
}

// UpdateLoginSuccess records a successful login
func (r *AuthRepository) UpdateLoginSuccess(ctx context.Context, userID string, ipAddress string) error {
	query := `
		UPDATE users
		SET
			failed_login_count = 0,
			last_login_at = NOW(),
			last_login_ip = $2,
			locked_until = NULL
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, userID, ipAddress)
	if err != nil {
		return fmt.Errorf("update login success: %w", err)
	}

	return nil
}

// RecordLoginAttempt records a login attempt for audit
func (r *AuthRepository) RecordLoginAttempt(ctx context.Context, params auth.LoginAttemptParams) error {
	query := `
		INSERT INTO login_attempts (user_id, email, ip_address, success, fail_reason, method, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`

	_, err := r.db.Exec(ctx, query,
		params.UserID,
		params.Email,
		params.IPAddress,
		params.Success,
		params.FailReason,
		params.Method,
	)
	if err != nil {
		// Log but don't fail on audit record errors
		r.logger.Warn("Failed to record login attempt",
			zap.Error(err),
			zap.String("email", params.Email),
		)
		return nil
	}

	return nil
}
